const express = require('express');
const axios = require('axios');
const path = require('path');
const session = require('express-session');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: 'facebook-booster-secret-key',
  resave: false,
  saveUnitialized: true,
  cookie: { secure: false }
}));

// Mock database for storing history and stats
const userHistory = {};
const stats = {
  totalShares: 0,
  successfulShares: 0,
  failedShares: 0,
  activeProcesses: 0
};

const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

function extract_token(cookie, ua) {
  try {
    return axios.get("https://business.facebook.com/business_locations", {
      headers: {
        "user-agent": ua,
        "referer": "https://www.facebook.com/",
        "Cookie": cookie
      }
    }).then(res => {
      const tokenMatch = res.data.match(/(EAAG\w+)/);
      return tokenMatch ? tokenMatch[1] : null;
    }).catch(err => {
      console.error('Token extraction error:', err.message);
      return null;
    });
  } catch (err) {
    console.error('Token extraction exception:', err.message);
    return null;
  }
}

// Serve main HTML files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get("/share", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// API endpoint for sharing - ORIGINAL LOGIC
app.post("/api/share", async (req, res) => {
  const { cookie, link: post_link, limit, delay = 0 } = req.body;
  const limitNum = parseInt(limit, 10);
  const delayMs = parseInt(delay, 10);

  if (!cookie || !post_link || !limitNum) {
    return res.json({ status: false, message: "Missing required fields." });
  }

  const sessionId = req.sessionID;
  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const processId = Date.now().toString();
  
  // Initialize process tracking
  const process = {
    id: processId,
    status: 'starting',
    success: 0,
    failed: 0,
    total: limitNum,
    current: 0,
    link: post_link,
    startTime: new Date().toISOString()
  };

  // Store process in session
  if (!req.session.processes) req.session.processes = {};
  req.session.processes[processId] = process;
  
  stats.activeProcesses++;

  // Send initial response
  res.json({
    status: true,
    message: "Process started",
    processId: processId
  });

  // Extract token
  const token = await extract_token(cookie, ua);
  if (!token) {
    process.status = 'failed';
    process.error = 'Token extraction failed';
    stats.activeProcesses--;
    return;
  }

  // Process shares in background - ORIGINAL LOGIC IMPLEMENTATION
  processShares(processId, req.session, {
    cookie, post_link, limitNum, delayMs, token, ua
  });
});

// Get process status
app.get("/api/process/:id", (req, res) => {
  const processId = req.params.id;
  if (req.session.processes && req.session.processes[processId]) {
    res.json({
      status: true,
      process: req.session.processes[processId]
    });
  } else {
    res.json({ status: false, message: "Process not found" });
  }
});

// Get history
app.get("/api/history", (req, res) => {
  const sessionId = req.sessionID;
  res.json({
    status: true,
    history: userHistory[sessionId] || []
  });
});

// Get stats
app.get("/api/stats", (req, res) => {
  res.json({ status: true, stats });
});

// Clear history
app.post("/api/history/clear", (req, res) => {
  const sessionId = req.sessionID;
  userHistory[sessionId] = [];
  res.json({ status: true, message: "History cleared" });
});

// ORIGINAL LOGIC - Background processing function
async function processShares(processId, session, params) {
  const { cookie, post_link, limitNum, delayMs, token, ua } = params;
  const process = session.processes[processId];
  
  process.status = 'processing';
  let success = 0;
  let failed = 0;
  
  // ORIGINAL LOGIC: Parallel processing for faster boosts
  const sharePromises = [];
  
  for (let i = 0; i < limitNum; i++) {
    sharePromises.push(
      new Promise(async (resolve) => {
        try {
          // Small delay between requests if specified
          if (i > 0 && delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }
          
          const response = await axios.post(
            "https://graph.facebook.com/v18.0/me/feed",
            null,
            {
              params: { 
                link: post_link, 
                access_token: token, 
                published: 0 
              },
              headers: {
                "user-agent": ua,
                "Cookie": cookie
              },
              timeout: 10000 // 10 second timeout
            }
          );
          
          if (response.data && response.data.id) {
            success++;
            stats.successfulShares++;
            resolve({ success: true, index: i });
          } else {
            failed++;
            stats.failedShares++;
            resolve({ success: false, index: i, error: 'No ID returned' });
          }
          
        } catch (err) {
          console.error(`Share error ${i + 1}:`, err.message);
          failed++;
          stats.failedShares++;
          resolve({ success: false, index: i, error: err.message });
        }
      })
    );
    
    // Update process status in real-time
    if (i % 5 === 0 || i === limitNum - 1) {
      process.current = i + 1;
      process.success = success;
      process.failed = failed;
    }
  }
  
  // Wait for all shares to complete
  try {
    const results = await Promise.allSettled(sharePromises);
    
    // Final count of successes
    const finalSuccess = results.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;
    
    const finalFailed = limitNum - finalSuccess;
    
    // Finalize process
    process.status = 'completed';
    process.success = finalSuccess;
    process.failed = finalFailed;
    process.endTime = new Date().toISOString();
    process.duration = new Date(process.endTime) - new Date(process.startTime);
    
    // Add to history
    const sessionId = session.id;
    if (!userHistory[sessionId]) userHistory[sessionId] = [];
    
    const historyEntry = {
      id: processId,
      link: post_link,
      success: finalSuccess,
      failed: finalFailed,
      total: limitNum,
      date: process.endTime,
      duration: process.duration,
      successRate: Math.round((finalSuccess / limitNum) * 100)
    };
    
    userHistory[sessionId].unshift(historyEntry);
    
    // Keep only last 20 history items
    if (userHistory[sessionId].length > 20) {
      userHistory[sessionId] = userHistory[sessionId].slice(0, 20);
    }
    
    // Update global stats
    stats.totalShares = stats.successfulShares + stats.failedShares;
    
  } catch (error) {
    console.error('Process error:', error);
    process.status = 'error';
    process.error = error.message;
  }
  
  stats.activeProcesses--;
  
  // Clean up old processes after 1 hour
  setTimeout(() => {
    if (session.processes && session.processes[processId]) {
      delete session.processes[processId];
    }
  }, 3600000); // 1 hour
}

// CORS headers for API requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Visit: http://localhost:${port}`);
  console.log(`✅ Original logic restored: Fast boosts, no artificial limits`);
});

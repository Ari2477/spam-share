const express = require('express');
const axios = require('axios');
const path = require('path');
const session = require('express-session');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration - FIXED
app.use(session({
  secret: 'facebook-booster-secret-key',
  resave: false, // DONT CHANGE THIS
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Store active processes globally (not just in session)
const activeProcesses = {};
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
      },
      timeout: 10000
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

// API endpoint for sharing - FIXED
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
  
  // Initialize process object - FIXED
  const process = {
    id: processId,
    status: 'starting',
    success: 0,
    failed: 0,
    total: limitNum,
    current: 0, // THIS WAS MISSING - causes progress bar issue
    link: post_link,
    startTime: new Date().toISOString(),
    lastUpdate: new Date().toISOString()
  };

  // Store process in global activeProcesses - FIXED
  activeProcesses[processId] = process;
  stats.activeProcesses++;

  // Send initial response
  res.json({
    status: true,
    message: "Process started successfully",
    processId: processId
  });

  // Extract token
  const token = await extract_token(cookie, ua);
  if (!token) {
    process.status = 'failed';
    process.error = 'Token extraction failed';
    delete activeProcesses[processId];
    stats.activeProcesses--;
    return;
  }

  // Process shares in background
  processShares(processId, {
    cookie, post_link, limitNum, delayMs, token, ua, sessionId
  });
});

// Get process status - FIXED
app.get("/api/process/:id", (req, res) => {
  const processId = req.params.id;
  
  if (activeProcesses[processId]) {
    const process = activeProcesses[processId];
    res.json({
      status: true,
      process: process
    });
  } else {
    res.json({ 
      status: false, 
      message: "Process not found",
      error: "Process may have completed or been removed"
    });
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
  res.json({ 
    status: true, 
    stats: {
      ...stats,
      // Calculate additional stats
      successRate: stats.totalShares > 0 ? 
        Math.round((stats.successfulShares / stats.totalShares) * 100) : 0
    }
  });
});

// Stop process
app.post("/api/process/:id/stop", (req, res) => {
  const processId = req.params.id;
  
  if (activeProcesses[processId]) {
    activeProcesses[processId].status = 'stopped';
    activeProcesses[processId].error = 'Stopped by user';
    res.json({ status: true, message: "Process stopped" });
  } else {
    res.json({ status: false, message: "Process not found" });
  }
});

// Clear history
app.post("/api/history/clear", (req, res) => {
  const sessionId = req.sessionID;
  userHistory[sessionId] = [];
  res.json({ status: true, message: "History cleared" });
});

// FIXED - Background processing function
async function processShares(processId, params) {
  const { cookie, post_link, limitNum, delayMs, token, ua, sessionId } = params;
  const process = activeProcesses[processId];
  
  if (!process) {
    console.error(`Process ${processId} not found`);
    return;
  }
  
  process.status = 'processing';
  
  for (let i = 0; i < limitNum; i++) {
    // Check if process was stopped
    if (process.status === 'stopped') {
      break;
    }
    
    // Update current progress - FIXED
    process.current = i + 1;
    process.lastUpdate = new Date().toISOString();
    
    try {
      // Small delay if specified
      if (delayMs > 0 && i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
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
          timeout: 10000
        }
      );
      
      if (response.data && response.data.id) {
        process.success++;
        stats.successfulShares++;
      } else {
        process.failed++;
        stats.failedShares++;
      }
      
    } catch (err) {
      console.error(`Share error ${i + 1}:`, err.message);
      process.failed++;
      stats.failedShares++;
      
      // Continue despite errors
    }
    
    // Update total shares count
    stats.totalShares = stats.successfulShares + stats.failedShares;
  }
  
  // Finalize process - FIXED
  process.status = 'completed';
  process.endTime = new Date().toISOString();
  process.duration = new Date(process.endTime) - new Date(process.startTime);
  
  // Add to history
  if (!userHistory[sessionId]) {
    userHistory[sessionId] = [];
  }
  
  userHistory[sessionId].unshift({
    id: processId,
    link: post_link,
    success: process.success,
    failed: process.failed,
    total: limitNum,
    date: process.endTime,
    duration: process.duration
  });
  
  // Keep only last 20 history items
  if (userHistory[sessionId].length > 20) {
    userHistory[sessionId] = userHistory[sessionId].slice(0, 20);
  }
  
  // Clean up active process after 5 minutes
  setTimeout(() => {
    if (activeProcesses[processId]) {
      delete activeProcesses[processId];
      stats.activeProcesses = Math.max(0, stats.activeProcesses - 1);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  console.log(`Process ${processId} completed: ${process.success}/${limitNum} successful`);
}

// Clean up old processes periodically
setInterval(() => {
  const now = new Date();
  const cutoff = 30 * 60 * 1000; // 30 minutes
  
  Object.keys(activeProcesses).forEach(processId => {
    const process = activeProcesses[processId];
    const processAge = now - new Date(process.startTime);
    
    if (processAge > cutoff) {
      delete activeProcesses[processId];
      stats.activeProcesses = Math.max(0, stats.activeProcesses - 1);
    }
  });
}, 10 * 60 * 1000); // Check every 10 minutes

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`✅ Visit: http://localhost:${port}`);
  console.log(`✅ Progress tracking FIXED`);
});

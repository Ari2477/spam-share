const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());  // For parsing JSON bodies
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public'));

// Serve static files from public directory
app.use(express.static('public'));

const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// In-memory storage for active processes (in production use Redis or database)
const activeProcesses = new Map();
const completedProcesses = [];
const MAX_COMPLETED_PROCESSES = 50; // Keep last 50 processes

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

// Generate unique ID for each process
function generateProcessId() {
  return 'proc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Clean up old processes
function cleanupOldProcesses() {
  if (completedProcesses.length > MAX_COMPLETED_PROCESSES) {
    completedProcesses.splice(0, completedProcesses.length - MAX_COMPLETED_PROCESSES);
  }
}

// Serve the single HTML file for all routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/share', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// New endpoint: Get all active processes
app.get('/api/processes', (req, res) => {
  const processes = Array.from(activeProcesses.values()).map(proc => ({
    id: proc.id,
    username: proc.username || 'Anonymous',
    status: proc.status,
    progress: proc.progress,
    total: proc.total,
    successful: proc.successful,
    startedAt: proc.startedAt,
    estimatedTime: proc.estimatedTime,
    mode: proc.mode,
    linkPreview: proc.linkPreview
  }));
  
  const recentCompleted = completedProcesses.slice(-10).reverse(); // Show last 10 completed
  
  res.json({
    status: true,
    active: processes,
    recent: recentCompleted,
    totalActive: processes.length,
    totalCompleted: completedProcesses.length,
    serverTime: new Date().toISOString()
  });
});

// New endpoint: Get process details
app.get('/api/process/:id', (req, res) => {
  const processId = req.params.id;
  const process = activeProcesses.get(processId) || 
                  completedProcesses.find(p => p.id === processId);
  
  if (!process) {
    return res.json({ status: false, message: "Process not found" });
  }
  
  res.json({
    status: true,
    process: process
  });
});

app.post("/api/share", async (req, res) => {
  const { cookie, link: post_link, limit, delay, unlimited } = req.body;
  const delayMs = parseInt(delay, 10) || 1000;
  const isUnlimited = unlimited === true || unlimited === 'true' || unlimited === 'on';

  console.log('📨 API Request:', { 
    hasCookie: !!cookie, 
    hasLink: !!post_link, 
    limit, 
    delayMs, 
    isUnlimited 
  });

  if (!cookie || !post_link) {
    console.log('❌ Missing input');
    return res.json({ status: false, message: "Missing cookie or link." });
  }

  let limitNum;
  
  if (isUnlimited) {
    limitNum = 10000; // Max 10,000 even for unlimited
    console.log('♾️ Unlimited mode - Max 10,000 shares');
  } else {
    limitNum = parseInt(limit, 10);
    
    if (isNaN(limitNum)) {
      console.log('❌ Invalid limit number');
      return res.json({ status: false, message: "Please enter a valid number of shares." });
    }
    
    if (limitNum < 100) {
      console.log('❌ Below minimum:', limitNum);
      return res.json({ 
        status: false, 
        message: "Minimum shares is 100. Please increase the number of shares." 
      });
    }
    
    if (limitNum > 10000) {
      console.log('❌ Above maximum:', limitNum);
      return res.json({ 
        status: false, 
        message: "Maximum shares is 10,000. Please decrease the number of shares." 
      });
    }
    
    console.log(`✅ Valid share count: ${limitNum}`);
  }

  // Extract username from cookie for display
  let username = 'Anonymous';
  try {
    const userMatch = cookie.match(/c_user=(\d+)/);
    if (userMatch) {
      username = 'User_' + userMatch[1].substring(0, 6);
    }
  } catch (e) {
    // If can't extract username, keep as Anonymous
  }

  // Create process record
  const processId = generateProcessId();
  const processData = {
    id: processId,
    username: username,
    status: 'initializing',
    progress: 0,
    total: limitNum,
    successful: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    estimatedTime: Math.round((limitNum * delayMs) / 1000),
    mode: isUnlimited ? 'unlimited' : 'limited',
    linkPreview: post_link.substring(0, 50) + (post_link.length > 50 ? '...' : ''),
    fullLink: post_link,
    delay: delayMs,
    logs: []
  };

  // Add initial log
  processData.logs.push({
    time: new Date().toISOString(),
    message: `Process started: ${limitNum} shares with ${delayMs}ms delay`,
    type: 'info'
  });

  // Store process
  activeProcesses.set(processId, processData);

  // Update status
  processData.status = 'extracting_token';
  processData.logs.push({
    time: new Date().toISOString(),
    message: 'Extracting Facebook access token...',
    type: 'info'
  });

  // Extract token
  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const token = await extract_token(cookie, ua);
  
  if (!token) {
    processData.status = 'failed';
    processData.logs.push({
      time: new Date().toISOString(),
      message: 'Token extraction failed',
      type: 'error'
    });
    
    // Move to completed
    activeProcesses.delete(processId);
    completedProcesses.push(processData);
    cleanupOldProcesses();
    
    console.log('❌ Token extraction failed');
    return res.json({ status: false, message: "Token extraction failed. Please check your cookie." });
  }

  processData.status = 'sharing';
  processData.logs.push({
    time: new Date().toISOString(),
    message: 'Token extracted successfully. Starting sharing process...',
    type: 'success'
  });

  console.log('✅ Token extracted successfully');
  console.log(`🔄 Starting ${isUnlimited ? 'unlimited (max 10k)' : limitNum} shares with ${delayMs}ms delay`);

  let success = 0;
  let errors = 0;
  const maxErrors = 3;
  
  // Start sharing process
  for (let i = 0; i < limitNum; i++) {
    // Update process progress
    processData.progress = Math.round((i / limitNum) * 100);
    processData.successful = success;
    processData.failed = errors;
    
    // Update every 5% or every 100 shares, whichever is smaller
    const updateInterval = Math.max(1, Math.min(Math.floor(limitNum / 20), 100));
    
    if (i % updateInterval === 0 || i === limitNum - 1) {
      processData.logs.push({
        time: new Date().toISOString(),
        message: `Progress: ${processData.progress}% (${i}/${limitNum}) - ${success} successful, ${errors} failed`,
        type: 'progress'
      });
    }
    
    try {
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
          }
        }
      );
      
      if (response.data.id) {
        success++;
        errors = 0;
        
        // Update process
        processData.successful = success;
        
        // Add delay between shares
        if (i < limitNum - 1 && delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        console.log('❌ No ID returned from Facebook');
        errors++;
        processData.failed = errors;
        processData.logs.push({
          time: new Date().toISOString(),
          message: `Share ${i + 1} failed: No ID returned`,
          type: 'warning'
        });
        
        if (errors >= maxErrors) {
          processData.logs.push({
            time: new Date().toISOString(),
            message: `Stopping due to ${maxErrors} consecutive errors`,
            type: 'error'
          });
          break;
        }
      }
    } catch (err) {
      console.error('❌ Share error:', err.message);
      errors++;
      processData.failed = errors;
      
      processData.logs.push({
        time: new Date().toISOString(),
        message: `Share ${i + 1} error: ${err.message}`,
        type: 'error'
      });
      
      // Enhanced error handling
      if (err.response) {
        const errorData = err.response.data;
        
        if (errorData.error && errorData.error.code === 190) {
          processData.status = 'failed';
          processData.logs.push({
            time: new Date().toISOString(),
            message: 'Access token expired',
            type: 'error'
          });
          
          // Move to completed
          activeProcesses.delete(processId);
          completedProcesses.push(processData);
          cleanupOldProcesses();
          
          return res.json({ 
            status: false, 
            message: "Access token expired. Please refresh your cookie.", 
            success_count: success 
          });
        }
        
        if (err.response.status === 429 || (errorData.error && errorData.error.code === 4)) {
          processData.status = 'failed';
          processData.logs.push({
            time: new Date().toISOString(),
            message: 'Rate limited by Facebook',
            type: 'error'
          });
          
          // Move to completed
          activeProcesses.delete(processId);
          completedProcesses.push(processData);
          cleanupOldProcesses();
          
          return res.json({ 
            status: false, 
            message: "Rate limited by Facebook. Please try again later.", 
            success_count: success 
          });
        }
      }
      
      if (errors >= maxErrors) {
        processData.logs.push({
          time: new Date().toISOString(),
          message: `Stopping due to ${maxErrors} consecutive errors`,
          type: 'error'
        });
        break;
      }
      
      // Wait before retrying after error
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Process completed
  processData.status = 'completed';
  processData.progress = 100;
  processData.successful = success;
  processData.completedAt = new Date().toISOString();
  processData.duration = Date.now() - new Date(processData.startedAt).getTime();
  
  processData.logs.push({
    time: new Date().toISOString(),
    message: `Process completed: ${success} successful shares out of ${limitNum} attempted`,
    type: 'success'
  });

  console.log(`🎯 Completed: ${success} successful shares out of ${limitNum} attempted`);
  
  // Move from active to completed
  activeProcesses.delete(processId);
  completedProcesses.push(processData);
  cleanupOldProcesses();
  
  // Generate response message
  let message;
  if (isUnlimited) {
    message = `✅ Unlimited sharing completed. Successfully shared ${success} times.`;
  } else {
    const percentage = limitNum > 0 ? Math.round((success / limitNum) * 100) : 0;
    message = `✅ Shared ${success} out of ${limitNum} times (${percentage}% success rate) with ${delayMs}ms delay.`;
  }

  res.json({
    status: true,
    message: message,
    success_count: success,
    total_attempted: limitNum,
    unlimited_mode: isUnlimited,
    process_id: processId
  });
});

// Cleanup interval for stale processes (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [id, process] of activeProcesses.entries()) {
    const startTime = new Date(process.startedAt).getTime();
    if (now - startTime > oneHour) {
      // Process is stale (older than 1 hour)
      process.status = 'stale';
      process.logs.push({
        time: new Date().toISOString(),
        message: 'Process marked as stale (running for more than 1 hour)',
        type: 'warning'
      });
      
      activeProcesses.delete(id);
      completedProcesses.push(process);
      cleanupOldProcesses();
    }
  }
}, 5 * 60 * 1000); // 5 minutes

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`=========================================`);
  console.log(`🚀 Facebook Share Tool Server Started`);
  console.log(`📡 Port: ${port}`);
  console.log(`🌐 http://localhost:${port}`);
  console.log(`⚙️  Features:`);
  console.log(`   • Multi-User Processing Dashboard`);
  console.log(`   • Real-time Progress Tracking`);
  console.log(`   • 100-10,000 Shares Range`);
  console.log(`   • No Limit Mode`);
  console.log(`   • Process History`);
  console.log(`=========================================`);
});

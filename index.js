const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// REAL DATA STORAGE
const realData = {
  userLimits: new Map(),
  userHistory: new Map(),
  userStats: new Map(),
  processLogs: new Map(),
  activeProcesses: new Map()
};

function getUserId(cookie) {
  return Buffer.from(cookie.substring(0, 100)).toString('base64');
}

function extract_token(cookie, ua) {
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
    console.error('Token error:', err.message);
    return null;
  });
}

// REAL LIMIT CHECKING
function checkRealLimits(userId, requestedShares) {
  const now = Date.now();
  const userKey = `user_${userId}`;
  
  if (!realData.userLimits.has(userKey)) {
    realData.userLimits.set(userKey, {
      sharesToday: 0,
      sharesThisHour: 0,
      lastShareTime: 0,
      lastResetHour: now,
      lastResetDay: now,
      totalShares: 0,
      successfulShares: 0,
      failedShares: 0
    });
  }
  
  const user = realData.userLimits.get(userKey);
  
  // Reset counters
  if (now - user.lastResetHour > 3600000) {
    user.sharesThisHour = 0;
    user.lastResetHour = now;
  }
  
  if (now - user.lastResetDay > 86400000) {
    user.sharesToday = 0;
    user.lastResetDay = now;
  }
  
  // Check limits
  const MAX_PER_REQUEST = 50;
  const MAX_PER_HOUR = 200;
  const MAX_PER_DAY = 1000;
  
  if (requestedShares > MAX_PER_REQUEST) {
    return { allowed: false, message: `Max ${MAX_PER_REQUEST} shares per request` };
  }
  
  if (user.sharesThisHour + requestedShares > MAX_PER_HOUR) {
    return { allowed: false, message: `Hourly limit reached (${MAX_PER_HOUR}/hour)` };
  }
  
  if (user.sharesToday + requestedShares > MAX_PER_DAY) {
    return { allowed: false, message: `Daily limit reached (${MAX_PER_DAY}/day)` };
  }
  
  return { allowed: true, user };
}

// ADD PROCESS LOG
function addProcessLog(userId, processId, message, type = 'info') {
  const logKey = `process_${processId}`;
  if (!realData.processLogs.has(logKey)) {
    realData.processLogs.set(logKey, []);
  }
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    message: message,
    type: type
  };
  
  realData.processLogs.get(logKey).push(logEntry);
  
  // Also update user history
  if (!realData.userHistory.has(userId)) {
    realData.userHistory.set(userId, []);
  }
  
  // Keep only last 100 logs per process
  const logs = realData.processLogs.get(logKey);
  if (logs.length > 100) {
    logs.shift();
  }
  
  return logEntry;
}

// REAL SHARE FUNCTION
async function realShare(token, cookie, post_link, ua) {
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
        },
        timeout: 15000
      }
    );
    
    if (response.data && response.data.id) {
      return {
        success: true,
        postId: response.data.id,
        message: "Share successful"
      };
    } else {
      return {
        success: false,
        error: "No post ID returned",
        message: "Facebook API response missing ID"
      };
    }
  } catch (err) {
    const errorData = err.response?.data?.error || {};
    return {
      success: false,
      error: errorData.message || err.message,
      code: errorData.code,
      message: `API Error: ${errorData.message || err.message}`
    };
  }
}

// MAIN SHARE ENDPOINT
app.post("/api/share", async (req, res) => {
  console.log('\n=== REAL SHARE PROCESS STARTED ===');
  
  try {
    const { cookie, link: post_link, limit, delay = 1 } = req.body;
    
    if (!cookie || !post_link || !limit) {
      return res.json({ 
        status: false, 
        message: "Missing required parameters: cookie, link, limit" 
      });
    }
    
    const limitNum = parseInt(limit, 10);
    const delayNum = Math.max(1, parseInt(delay, 10)); // At least 1ms
    
    if (limitNum < 1 || limitNum > 50) {
      return res.json({ 
        status: false, 
        message: "Limit must be between 1 and 50" 
      });
    }
    
    const userId = getUserId(cookie);
    const processId = Date.now().toString();
    
    // Start process tracking
    realData.activeProcesses.set(processId, {
      userId: userId,
      startTime: new Date().toISOString(),
      status: 'processing',
      progress: 0,
      total: limitNum
    });
    
    addProcessLog(userId, processId, `🚀 Starting REAL share process for ${limitNum} shares`, 'start');
    addProcessLog(userId, processId, `📎 Post: ${post_link.substring(0, 50)}...`, 'info');
    addProcessLog(userId, processId, `⏱️ Delay between shares: ${delayNum}ms`, 'info');
    
    // Check limits
    const limitCheck = checkRealLimits(userId, limitNum);
    if (!limitCheck.allowed) {
      addProcessLog(userId, processId, `❌ Limit check failed: ${limitCheck.message}`, 'error');
      realData.activeProcesses.delete(processId);
      return res.json({ status: false, message: limitCheck.message });
    }
    
    addProcessLog(userId, processId, '✅ Limits check passed', 'success');
    
    // Get token
    const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
    addProcessLog(userId, processId, '🔑 Extracting Facebook token...', 'info');
    
    const token = await extract_token(cookie, ua);
    if (!token) {
      addProcessLog(userId, processId, '❌ Failed to extract Facebook token', 'error');
      realData.activeProcesses.delete(processId);
      return res.json({ 
        status: false, 
        message: "Token extraction failed. Check your cookie." 
      });
    }
    
    addProcessLog(userId, processId, `✅ Token extracted (${token.substring(0, 15)}...)`, 'success');
    
    // Update limits
    const user = limitCheck.user;
    user.sharesToday += limitNum;
    user.sharesThisHour += limitNum;
    user.totalShares += limitNum;
    
    // REAL SHARING PROCESS
    let successCount = 0;
    let failedCount = 0;
    const results = [];
    
    addProcessLog(userId, processId, '🔄 Starting REAL sharing process...', 'processing');
    
    for (let i = 0; i < limitNum; i++) {
      // Update progress
      const progress = Math.round(((i + 1) / limitNum) * 100);
      const activeProcess = realData.activeProcesses.get(processId);
      if (activeProcess) {
        activeProcess.progress = progress;
        activeProcess.current = i + 1;
      }
      
      // Add delay (except for first share)
      if (i > 0 && delayNum > 0) {
        await new Promise(resolve => setTimeout(resolve, delayNum));
      }
      
      // REAL API CALL
      addProcessLog(userId, processId, `📤 Share ${i + 1}/${limitNum}...`, 'processing');
      
      const shareResult = await realShare(token, cookie, post_link, ua);
      results.push({
        index: i + 1,
        timestamp: new Date().toISOString(),
        ...shareResult
      });
      
      if (shareResult.success) {
        successCount++;
        user.successfulShares++;
        addProcessLog(userId, processId, `✅ Share ${i + 1} successful`, 'success');
      } else {
        failedCount++;
        user.failedShares++;
        addProcessLog(userId, processId, `❌ Share ${i + 1} failed: ${shareResult.error}`, 'error');
      }
    }
    
    // Update user last share time
    user.lastShareTime = Date.now();
    
    // Save to history
    const historyEntry = {
      id: processId,
      userId: userId,
      postLink: post_link,
      limit: limitNum,
      delay: delayNum,
      success: successCount,
      failed: failedCount,
      results: results,
      startedAt: realData.activeProcesses.get(processId)?.startTime,
      completedAt: new Date().toISOString(),
      totalTime: Date.now() - new Date(realData.activeProcesses.get(processId)?.startTime).getTime()
    };
    
    if (!realData.userHistory.has(userId)) {
      realData.userHistory.set(userId, []);
    }
    
    realData.userHistory.get(userId).push(historyEntry);
    
    // Update stats
    realData.userStats.set(userId, {
      totalShares: user.totalShares,
      successfulShares: user.successfulShares,
      failedShares: user.failedShares,
      successRate: user.totalShares > 0 ? 
        Math.round((user.successfulShares / user.totalShares) * 100) : 0,
      lastActivity: new Date().toISOString()
    });
    
    // Complete process
    addProcessLog(userId, processId, 
      `🎉 REAL PROCESS COMPLETED: ${successCount} successful, ${failedCount} failed`, 
      'complete'
    );
    
    const activeProcess = realData.activeProcesses.get(processId);
    if (activeProcess) {
      activeProcess.status = 'completed';
      activeProcess.endTime = new Date().toISOString();
      activeProcess.successCount = successCount;
      activeProcess.failedCount = failedCount;
    }
    
    console.log(`=== REAL SHARE PROCESS COMPLETED: ${successCount}/${limitNum} successful ===\n`);
    
    res.json({
      status: true,
      message: `REAL PROCESS: ${successCount} successful, ${failedCount} failed`,
      summary: {
        total: limitNum,
        success: successCount,
        failed: failedCount,
        success_rate: limitNum > 0 ? Math.round((successCount / limitNum) * 100) : 0,
        total_time: historyEntry.totalTime
      },
      results: results,
      process_id: processId,
      limits: {
        remaining_today: 1000 - user.sharesToday,
        remaining_hour: 200 - user.sharesThisHour,
        shares_today: user.sharesToday,
        shares_hour: user.sharesThisHour,
        max_per_request: 50
      }
    });
    
  } catch (error) {
    console.error('REAL PROCESS ERROR:', error);
    
    // Log error
    const userId = req.body.cookie ? getUserId(req.body.cookie) : 'unknown';
    const processId = Date.now().toString();
    addProcessLog(userId, processId, `💥 PROCESS ERROR: ${error.message}`, 'error');
    
    res.json({
      status: false,
      message: "REAL PROCESS ERROR: " + error.message
    });
  }
});

// REAL PROCESS HISTORY
app.post("/api/process-history", async (req, res) => {
  try {
    const { cookie } = req.body;
    
    if (!cookie) {
      return res.json({ status: false, message: "Cookie required" });
    }
    
    const userId = getUserId(cookie);
    const userHistory = realData.userHistory.get(userId) || [];
    const processLogs = [];
    
    // Get all process logs for this user
    for (const [processId, logs] of realData.processLogs) {
      if (processId.startsWith('process_')) {
        const processData = realData.activeProcesses.get(processId.replace('process_', ''));
        if (processData && processData.userId === userId) {
          processLogs.push({
            processId: processId.replace('process_', ''),
            logs: logs.slice(-20), // Last 20 logs
            status: processData.status,
            progress: processData.progress,
            startTime: processData.startTime
          });
        }
      }
    }
    
    // Sort by recent
    processLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    res.json({
      status: true,
      history: userHistory.slice(-10).reverse(), // Last 10 sessions
      active_processes: processLogs.filter(p => p.status === 'processing'),
      recent_logs: processLogs.slice(0, 5) // Recent 5 processes
    });
    
  } catch (error) {
    console.error('History error:', error);
    res.json({ status: false, message: error.message });
  }
});

// REAL-TIME PROCESS MONITORING
app.post("/api/process-monitor", async (req, res) => {
  try {
    const { cookie, process_id } = req.body;
    
    if (!cookie || !process_id) {
      return res.json({ status: false, message: "Missing parameters" });
    }
    
    const userId = getUserId(cookie);
    const processKey = `process_${process_id}`;
    const logs = realData.processLogs.get(processKey) || [];
    const process = realData.activeProcesses.get(process_id);
    
    if (!process) {
      return res.json({ 
        status: false, 
        message: "Process not found or completed" 
      });
    }
    
    res.json({
      status: true,
      process: {
        id: process_id,
        status: process.status,
        progress: process.progress,
        current: process.current || 0,
        total: process.total || 0,
        startTime: process.startTime,
        userId: process.userId
      },
      logs: logs.slice(-20), // Last 20 logs
      total_logs: logs.length
    });
    
  } catch (error) {
    console.error('Monitor error:', error);
    res.json({ status: false, message: error.message });
  }
});

// REAL STATISTICS
app.post("/api/stats", async (req, res) => {
  try {
    const { cookie } = req.body;
    
    if (!cookie) {
      return res.json({ status: false, message: "Cookie required" });
    }
    
    const userId = getUserId(cookie);
    const userKey = `user_${userId}`;
    const user = realData.userLimits.get(userKey) || {
      sharesToday: 0,
      sharesThisHour: 0,
      totalShares: 0,
      successfulShares: 0,
      failedShares: 0
    };
    
    const userHistory = realData.userHistory.get(userId) || [];
    
    // Calculate REAL statistics
    let totalTime = 0;
    let totalSharesProcessed = 0;
    
    userHistory.forEach(entry => {
      totalTime += entry.totalTime || 0;
      totalSharesProcessed += entry.limit || 0;
    });
    
    const avgTimePerShare = totalSharesProcessed > 0 ? 
      Math.round(totalTime / totalSharesProcessed) : 0;
    
    const successRate = user.totalShares > 0 ? 
      Math.round((user.successfulShares / user.totalShares) * 100) : 0;
    
    // Get recent activity
    const recentActivity = userHistory
      .slice(-5)
      .reverse()
      .map(entry => ({
        date: entry.startedAt,
        success: entry.success,
        total: entry.limit,
        success_rate: entry.limit > 0 ? Math.round((entry.success / entry.limit) * 100) : 0
      }));
    
    res.json({
      status: true,
      stats: {
        total_shares: user.totalShares,
        successful_shares: user.successfulShares,
        failed_shares: user.failedShares,
        success_rate: successRate,
        shares_today: user.sharesToday,
        shares_hour: user.sharesThisHour,
        avg_time_per_share: avgTimePerShare,
        total_sessions: userHistory.length,
        total_processing_time: totalTime
      },
      limits: {
        max_per_request: 50,
        max_per_hour: 200,
        max_per_day: 1000,
        remaining_today: 1000 - user.sharesToday,
        remaining_hour: 200 - user.sharesThisHour
      },
      recent_activity: recentActivity,
      overall: {
        active_processes: Array.from(realData.activeProcesses.values())
          .filter(p => p.status === 'processing').length,
        total_users: realData.userLimits.size,
        total_processes: realData.processLogs.size
      }
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.json({ status: false, message: error.message });
  }
});

// REAL-TIME ACTIVE PROCESSES
app.post("/api/active-processes", async (req, res) => {
  try {
    const { cookie } = req.body;
    
    if (!cookie) {
      return res.json({ status: false, message: "Cookie required" });
    }
    
    const userId = getUserId(cookie);
    const activeProcesses = [];
    
    for (const [processId, process] of realData.activeProcesses) {
      if (process.userId === userId && process.status === 'processing') {
        const processKey = `process_${processId}`;
        const logs = realData.processLogs.get(processKey) || [];
        
        activeProcesses.push({
          processId: processId,
          progress: process.progress,
          current: process.current || 0,
          total: process.total || 0,
          startTime: process.startTime,
          lastLog: logs[logs.length - 1] || null,
          totalLogs: logs.length
        });
      }
    }
    
    res.json({
      status: true,
      active_processes: activeProcesses,
      count: activeProcesses.length
    });
    
  } catch (error) {
    console.error('Active processes error:', error);
    res.json({ status: false, message: error.message });
  }
});

// CLEAR USER DATA
app.post("/api/clear-data", async (req, res) => {
  try {
    const { cookie, confirm } = req.body;
    
    if (!cookie || confirm !== 'DELETE') {
      return res.json({ 
        status: false, 
        message: "Confirmation required. Send confirm: 'DELETE'" 
      });
    }
    
    const userId = getUserId(cookie);
    const userKey = `user_${userId}`;
    
    // Clear user data
    realData.userLimits.delete(userKey);
    realData.userHistory.delete(userId);
    realData.userStats.delete(userId);
    
    // Clear process logs for this user
    for (const [processId, process] of realData.activeProcesses) {
      if (process.userId === userId) {
        realData.activeProcesses.delete(processId);
        realData.processLogs.delete(`process_${processId}`);
      }
    }
    
    console.log(`User data cleared for: ${userId}`);
    
    res.json({
      status: true,
      message: "All user data cleared successfully"
    });
    
  } catch (error) {
    console.error('Clear data error:', error);
    res.json({ status: false, message: error.message });
  }
});

// SYSTEM STATUS
app.get("/api/system-status", async (req, res) => {
  try {
    const now = new Date();
    
    const status = {
      status: "online",
      timestamp: now.toISOString(),
      server_time: now.toLocaleString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      system: {
        total_users: realData.userLimits.size,
        total_processes: realData.processLogs.size,
        active_processes: Array.from(realData.activeProcesses.values())
          .filter(p => p.status === 'processing').length,
        completed_today: Array.from(realData.userHistory.values())
          .flat()
          .filter(h => new Date(h.startedAt).toDateString() === now.toDateString())
          .length
      },
      limits: {
        max_per_request: 50,
        max_per_hour: 200,
        max_per_day: 1000,
        default_delay: 1
      }
    };
    
    res.json({
      status: true,
      data: status
    });
    
  } catch (error) {
    console.error('System status error:', error);
    res.json({ status: false, message: error.message });
  }
});

// Serve static files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: false,
    message: "Endpoint not found",
    available_endpoints: [
      "POST /api/share",
      "POST /api/process-history", 
      "POST /api/process-monitor",
      "POST /api/stats",
      "POST /api/active-processes",
      "GET /api/system-status"
    ]
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 REAL FACEBOOK SHARE TOOL BACKEND');
  console.log('='.repeat(50));
  console.log(`✅ Server running on port: ${port}`);
  console.log(`✅ REAL processing enabled`);
  console.log(`✅ No dummy data - all processes are real`);
  console.log(`✅ Real-time monitoring available`);
  console.log('='.repeat(50));
  console.log('\n📊 REAL ENDPOINTS:');
  console.log('├── POST /api/share            - Real sharing process');
  console.log('├── POST /api/process-history  - Real process history');
  console.log('├── POST /api/process-monitor  - Real-time monitoring');
  console.log('├── POST /api/stats            - Real statistics');
  console.log('├── POST /api/active-processes - Active processes');
  console.log('└── GET /api/system-status     - System status');
  console.log('\n⚠️  WARNING: REAL Facebook API calls are being made!');
  console.log('⚠️  Use at your own risk!');
  console.log('='.repeat(50) + '\n');
});

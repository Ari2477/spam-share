const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Create public folder if it doesn't exist
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

// Copy index.html to public folder if needed
const staticHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facebook Share boost | Auto Sharing Tool</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- CSS content from your static file -->
</head>
<body>
    <!-- Your complete HTML content -->
</body>
</html>`;

// Only write if file doesn't exist
if (!fs.existsSync('public/index.html')) {
  fs.writeFileSync('public/index.html', staticHtml);
}

const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]"
];

// ENHANCED SHARE LIMITS CONFIGURATION
const SHARE_LIMITS = {
  MAX_PER_REQUEST: 50,           
  MAX_PER_HOUR: 200,             
  MAX_PER_DAY: 1000,             
  MIN_DELAY: 1,                 
  MAX_DELAY: 5000,               
  DEFAULT_DELAY: 1,              
  REQUEST_TIMEOUT: 30000,        
  TOKEN_TIMEOUT: 10000           
};

// Store user limits and history (in production, use database)
const userData = {
  limits: new Map(),      
  history: new Map(),     
  accounts: new Map()     
};

// Helper function to get user identifier from cookie
function getUserId(cookie) {
  // Create a unique ID from cookie (first 100 chars)
  return Buffer.from(cookie.substring(0, 100)).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
}

// Helper function to check and update user limits
function checkUserLimits(userId, requestedShares) {
  const now = Date.now();
  const userKey = `user_${userId}`;
  
  // Initialize user data if not exists
  if (!userData.limits.has(userKey)) {
    userData.limits.set(userKey, {
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
  
  const user = userData.limits.get(userKey);
  
  // Reset counters if needed
  if (now - user.lastResetHour > 3600000) { // 1 hour
    user.sharesThisHour = 0;
    user.lastResetHour = now;
  }
  
  if (now - user.lastResetDay > 86400000) { // 24 hours
    user.sharesToday = 0;
    user.lastResetDay = now;
  }
  
  // Check limits
  const errors = [];
  
  if (requestedShares > SHARE_LIMITS.MAX_PER_REQUEST) {
    errors.push(`Cannot share more than ${SHARE_LIMITS.MAX_PER_REQUEST} times per request.`);
  }
  
  if (user.sharesThisHour + requestedShares > SHARE_LIMITS.MAX_PER_HOUR) {
    const remaining = SHARE_LIMITS.MAX_PER_HOUR - user.sharesThisHour;
    errors.push(`Hourly limit reached. You can only share ${remaining} more times this hour.`);
  }
  
  if (user.sharesToday + requestedShares > SHARE_LIMITS.MAX_PER_DAY) {
    const remaining = SHARE_LIMITS.MAX_PER_DAY - user.sharesToday;
    errors.push(`Daily limit reached. You can only share ${remaining} more times today.`);
  }
  
  if (errors.length > 0) {
    return {
      allowed: false,
      errors: errors,
      limits: {
        sharesToday: user.sharesToday,
        sharesThisHour: user.sharesThisHour,
        maxPerRequest: SHARE_LIMITS.MAX_PER_REQUEST,
        maxPerHour: SHARE_LIMITS.MAX_PER_HOUR,
        maxPerDay: SHARE_LIMITS.MAX_PER_DAY
      }
    };
  }
  
  // Update limits (will be finalized after successful sharing)
  return {
    allowed: true,
    limits: {
      sharesToday: user.sharesToday,
      sharesThisHour: user.sharesThisHour,
      maxPerRequest: SHARE_LIMITS.MAX_PER_REQUEST,
      maxPerHour: SHARE_LIMITS.MAX_PER_HOUR,
      maxPerDay: SHARE_LIMITS.MAX_PER_DAY
    }
  };
}

// Function to extract Facebook token
async function extract_token(cookie, ua) {
  try {
    const response = await axios.get("https://business.facebook.com/business_locations", {
      headers: {
        "user-agent": ua,
        "referer": "https://www.facebook.com/",
        "Cookie": cookie,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      },
      timeout: SHARE_LIMITS.TOKEN_TIMEOUT
    });
    
    const tokenMatch = response.data.match(/(EAAG\w+)/);
    if (tokenMatch) {
      console.log(`✓ Token extracted successfully (${tokenMatch[1].substring(0, 10)}...)`);
      return tokenMatch[1];
    }
    
    // Try alternative token extraction
    const altTokenMatch = response.data.match(/access_token":"([^"]+)"/);
    if (altTokenMatch) {
      console.log(`✓ Alternative token extracted (${altTokenMatch[1].substring(0, 10)}...)`);
      return altTokenMatch[1];
    }
    
    console.log('✗ No access token found in response');
    return null;
    
  } catch (err) {
    console.error('Token extraction error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response headers:', err.response.headers);
    }
    return null;
  }
}

// Function to share post
async function sharePost(token, cookie, post_link, ua, attempt = 1) {
  try {
    const response = await axios.post(
      "https://graph.facebook.com/v18.0/me/feed",
      null,
      {
        params: { 
          link: post_link, 
          access_token: token, 
          published: "0"
        },
        headers: {
          "user-agent": ua,
          "Cookie": cookie,
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: SHARE_LIMITS.REQUEST_TIMEOUT
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
        message: "Facebook API did not return post ID"
      };
    }
    
  } catch (err) {
    const errorData = err.response?.data?.error || {};
    const errorCode = errorData.code;
    const errorMessage = errorData.message || err.message;
    
    // Retry logic for certain errors
    if (attempt < 3 && (errorCode === 4 || errorCode === 17 || errorCode === 32)) {
      console.log(`Retrying share (attempt ${attempt + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      return sharePost(token, cookie, post_link, ua, attempt + 1);
    }
    
    return {
      success: false,
      error: errorMessage,
      code: errorCode,
      message: `Share failed: ${errorMessage}`
    };
  }
}

// ============= ROUTES =============

// Home page - serve static HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Health Check
app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    limits: SHARE_LIMITS
  });
});

// Get user limits
app.post("/api/limits", (req, res) => {
  try {
    const { cookie } = req.body;
    
    if (!cookie) {
      return res.json({
        status: false,
        message: "Cookie is required"
      });
    }
    
    const userId = getUserId(cookie);
    const limitCheck = checkUserLimits(userId, 0);
    
    res.json({
      status: true,
      limits: limitCheck.limits,
      remaining: {
        today: SHARE_LIMITS.MAX_PER_DAY - (limitCheck.limits?.sharesToday || 0),
        hour: SHARE_LIMITS.MAX_PER_HOUR - (limitCheck.limits?.sharesThisHour || 0),
        request: SHARE_LIMITS.MAX_PER_REQUEST
      }
    });
    
  } catch (error) {
    console.error('Limits error:', error);
    res.json({
      status: false,
      message: "Server error checking limits"
    });
  }
});

// Main Share API Endpoint
app.post("/api/share", async (req, res) => {
  console.log('\n' + '='.repeat(50));
  console.log('📦 NEW SHARE REQUEST RECEIVED');
  console.log('='.repeat(50));
  
  try {
    const { cookie, link: post_link, limit, delay = SHARE_LIMITS.DEFAULT_DELAY } = req.body;
    
    // Validate inputs
    if (!cookie) {
      console.log('✗ Missing cookie');
      return res.json({ 
        status: false, 
        message: "Facebook cookie is required." 
      });
    }
    
    if (!post_link) {
      console.log('✗ Missing post link');
      return res.json({ 
        status: false, 
        message: "Post link is required." 
      });
    }
    
    const limitNum = parseInt(limit, 10);
    if (!limitNum || isNaN(limitNum) || limitNum < 1) {
      console.log('✗ Invalid share limit:', limit);
      return res.json({ 
        status: false, 
        message: "Valid share limit (min 1) is required." 
      });
    }
    
    const delayNum = parseInt(delay, 10);
    if (isNaN(delayNum) || delayNum < SHARE_LIMITS.MIN_DELAY || delayNum > SHARE_LIMITS.MAX_DELAY) {
      console.log('✗ Invalid delay:', delay);
      return res.json({ 
        status: false, 
        message: `Delay must be between ${SHARE_LIMITS.MIN_DELAY}ms and ${SHARE_LIMITS.MAX_DELAY}ms.` 
      });
    }
    
    console.log(`✓ Input validated: ${limitNum} shares, ${delayNum}ms delay`);
    
    // Check user limits
    const userId = getUserId(cookie);
    const limitCheck = checkUserLimits(userId, limitNum);
    
    if (!limitCheck.allowed) {
      console.log('✗ Limit check failed:', limitCheck.errors);
      return res.json({
        status: false,
        message: limitCheck.errors.join(' '),
        limits: limitCheck.limits
      });
    }
    
    console.log('✓ User limits check passed');
    
    // Get random user agent
    const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
    console.log(`✓ Using User-Agent: ${ua.substring(0, 50)}...`);
    
    // Extract Facebook token
    console.log('🔑 Extracting Facebook token...');
    const token = await extract_token(cookie, ua);
    
    if (!token) {
      console.log('✗ Token extraction failed');
      return res.json({ 
        status: false, 
        message: "Failed to extract Facebook access token. Check your cookie." 
      });
    }
    
    console.log(`✓ Token extracted: ${token.substring(0, 15)}...`);
    
    // Start sharing process
    console.log('🚀 Starting share process...');
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    const userKey = `user_${userId}`;
    const user = userData.limits.get(userKey);
    
    // Update user limits (pre-emptive)
    user.sharesToday += limitNum;
    user.sharesThisHour += limitNum;
    user.totalShares += limitNum;
    
    // Process each share
    for (let i = 0; i < limitNum; i++) {
      try {
        if (i > 0 && delayNum > 0) {
          await new Promise(resolve => setTimeout(resolve, delayNum));
        }
        
        console.log(`📤 Share ${i + 1}/${limitNum}...`);
        const shareResult = await sharePost(token, cookie, post_link, ua);
        
        const result = {
          index: i + 1,
          timestamp: new Date().toISOString(),
          ...shareResult
        };
        
        results.push(result);
        
        if (shareResult.success) {
          successCount++;
          user.successfulShares++;
          consecutiveErrors = 0; // Reset error counter
          console.log(`   ✅ Success (Post ID: ${shareResult.postId})`);
        } else {
          failedCount++;
          user.failedShares++;
          consecutiveErrors++;
          console.log(`   ❌ Failed: ${shareResult.error}`);

          if (consecutiveErrors >= maxConsecutiveErrors) {
            console.log(`   ⚠️ Stopping due to ${consecutiveErrors} consecutive errors`);
            break;
          }
        }
        
      } catch (error) {
        failedCount++;
        user.failedShares++;
        consecutiveErrors++;
        
        const errorResult = {
          index: i + 1,
          timestamp: new Date().toISOString(),
          success: false,
          error: error.message,
          message: "Unexpected error during sharing"
        };
        
        results.push(errorResult);
        console.log(`   💥 Unexpected error: ${error.message}`);
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.log(`   ⚠️ Stopping due to ${consecutiveErrors} consecutive errors`);
          break;
        }
      }
    }

    user.lastShareTime = Date.now();

    const historyEntry = {
      id: Date.now().toString(),
      userId: userId,
      postLink: post_link,
      limit: limitNum,
      delay: delayNum,
      success: successCount,
      failed: failedCount,
      results: results,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      totalTime: Date.now() - (user.lastShareTime - (limitNum * delayNum))
    };

    if (!userData.history.has(userId)) {
      userData.history.set(userId, []);
    }
    
    userData.history.get(userId).push(historyEntry);

    console.log('\n' + '='.repeat(50));
    console.log('📊 SHARE PROCESS COMPLETED');
    console.log('='.repeat(50));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log(`⏱️  Total time: ${historyEntry.totalTime}ms`);
    console.log(`📈 Success rate: ${limitNum > 0 ? Math.round((successCount / limitNum) * 100) : 0}%`);
    console.log(`👤 User stats - Today: ${user.sharesToday}, This hour: ${user.sharesThisHour}`);
    console.log('='.repeat(50) + '\n');

    res.json({
      status: true,
      message: `Sharing completed: ${successCount} successful, ${failedCount} failed`,
      summary: {
        total: limitNum,
        success: successCount,
        failed: failedCount,
        success_rate: limitNum > 0 ? Math.round((successCount / limitNum) * 100) : 0,
        total_time: historyEntry.totalTime
      },
      results: results,
      limits: {
        remaining_today: SHARE_LIMITS.MAX_PER_DAY - user.sharesToday,
        remaining_hour: SHARE_LIMITS.MAX_PER_HOUR - user.sharesThisHour,
        shares_today: user.sharesToday,
        shares_hour: user.sharesThisHour,
        max_per_request: SHARE_LIMITS.MAX_PER_REQUEST
      },
      history_id: historyEntry.id
    });
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR IN SHARE PROCESS:');
    console.error(error.stack);
    
    res.json({
      status: false,
      message: "Server error: " + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post("/api/history", (req, res) => {
  try {
    const { cookie, limit = 10 } = req.body;
    
    if (!cookie) {
      return res.json({
        status: false,
        message: "Cookie is required"
      });
    }
    
    const userId = getUserId(cookie);
    const userHistory = userData.history.get(userId) || [];

    const limitedHistory = userHistory
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, parseInt(limit));
    
    res.json({
      status: true,
      history: limitedHistory,
      total: userHistory.length
    });
    
  } catch (error) {
    console.error('History error:', error);
    res.json({
      status: false,
      message: "Error fetching history"
    });
  }
});

app.post("/api/stats", (req, res) => {
  try {
    const { cookie } = req.body;
    
    if (!cookie) {
      return res.json({
        status: false,
        message: "Cookie is required"
      });
    }
    
    const userId = getUserId(cookie);
    const userKey = `user_${userId}`;
    const user = userData.limits.get(userKey) || {
      sharesToday: 0,
      sharesThisHour: 0,
      totalShares: 0,
      successfulShares: 0,
      failedShares: 0
    };
    
    const userHistory = userData.history.get(userId) || [];

    let totalTime = 0;
    let totalShares = 0;
    
    userHistory.forEach(entry => {
      totalTime += entry.totalTime || 0;
      totalShares += entry.limit || 0;
    });
    
    const avgTimePerShare = totalShares > 0 ? Math.round(totalTime / totalShares) : 0;
    const successRate = user.totalShares > 0 ? 
      Math.round((user.successfulShares / user.totalShares) * 100) : 0;
    
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
        total_sessions: userHistory.length
      },
      limits: {
        max_per_request: SHARE_LIMITS.MAX_PER_REQUEST,
        max_per_hour: SHARE_LIMITS.MAX_PER_HOUR,
        max_per_day: SHARE_LIMITS.MAX_PER_DAY,
        remaining_today: SHARE_LIMITS.MAX_PER_DAY - user.sharesToday,
        remaining_hour: SHARE_LIMITS.MAX_PER_HOUR - user.sharesThisHour
      }
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.json({
      status: false,
      message: "Error fetching statistics"
    });
  }
});

app.post("/api/reset", (req, res) => {
  try {
    const { cookie, admin_key } = req.body;

    if (admin_key !== 'admin123') {
      return res.json({
        status: false,
        message: "Unauthorized"
      });
    }
    
    if (cookie) {
      const userId = getUserId(cookie);
      const userKey = `user_${userId}`;
      
      userData.limits.delete(userKey);
      userData.history.delete(userId);
      
      console.log(`User data reset for: ${userId}`);
      
      res.json({
        status: true,
        message: "User data reset successfully"
      });
    } else {
      userData.limits.clear();
      userData.history.clear();
      
      console.log("All user data reset");
      
      res.json({
        status: true,
        message: "All user data reset successfully"
      });
    }
    
  } catch (error) {
    console.error('Reset error:', error);
    res.json({
      status: false,
      message: "Error resetting data"
    });
  }
});

app.get("/api/test", (req, res) => {
  res.json({
    status: true,
    message: "API is working",
    timestamp: new Date().toISOString(),
    endpoints: [
      { method: "POST", path: "/api/share", description: "Share Facebook posts" },
      { method: "POST", path: "/api/limits", description: "Get user limits" },
      { method: "POST", path: "/api/history", description: "Get user history" },
      { method: "POST", path: "/api/stats", description: "Get user statistics" },
      { method: "GET", path: "/api/health", description: "API health check" }
    ]
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else if (req.accepts('json')) {
    res.status(404).json({
      status: false,
      message: "Endpoint not found"
    });
  } else {
    res.status(404).send("Not found");
  }
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({
    status: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Facebook Share Master Backend');
  console.log('='.repeat(50));
  console.log(`📡 Server running on port: ${port}`);
  console.log(`🌐 Access: http://localhost:${port}`);
  console.log('\n📊 Share Limits Configuration:');
  console.log(`   ├── Max per request: ${SHARE_LIMITS.MAX_PER_REQUEST}`);
  console.log(`   ├── Max per hour: ${SHARE_LIMITS.MAX_PER_HOUR}`);
  console.log(`   ├── Max per day: ${SHARE_LIMITS.MAX_PER_DAY}`);
  console.log(`   ├── Default delay: ${SHARE_LIMITS.DEFAULT_DELAY}ms`);
  console.log(`   └── Delay range: ${SHARE_LIMITS.MIN_DELAY}ms - ${SHARE_LIMITS.MAX_DELAY}ms`);
  console.log('\n🔧 Available Endpoints:');
  console.log('   ├── GET  /              - Main application');
  console.log('   ├── POST /api/share     - Share posts');
  console.log('   ├── POST /api/limits    - Check limits');
  console.log('   ├── POST /api/history   - Get history');
  console.log('   ├── POST /api/stats     - Get statistics');
  console.log('   ├── GET  /api/health    - Health check');
  console.log('   └── GET  /api/test      - Test endpoint');
  console.log('='.repeat(50) + '\n');
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  console.log('📊 Final statistics:');
  console.log(`   Total users: ${userData.limits.size}`);
  console.log(`   Total history entries: ${Array.from(userData.history.values()).reduce((sum, arr) => sum + arr.length, 0)}`);
  process.exit(0);
});

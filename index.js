const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set view engine (for compatibility)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// User agents for rotation
const ua_list = [
  "Mozilla/5.0 (Linux; Android 10; Wildfire E Lite) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.5195.136 Mobile Safari/537.36[FBAN/EMA;FBLC/en_US;FBAV/298.0.0.10.115;]",
  "Mozilla/5.0 (Linux; Android 11; KINGKONG 5 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/87.0.4280.141 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/320.0.0.12.108;]",
  "Mozilla/5.0 (Linux; Android 11; G91 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/106.0.5249.126 Mobile Safari/537.36[FBAN/EMA;FBLC/fr_FR;FBAV/325.0.1.4.108;]",
  "Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36"
];

// Token extraction with better error handling
async function extract_token(cookie, ua) {
  try {
    console.log('Extracting token with UA:', ua.substring(0, 50) + '...');
    
    const response = await axios.get("https://business.facebook.com/business_locations", {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "Referer": "https://www.facebook.com/",
        "Cookie": cookie
      },
      timeout: 10000
    });

    const tokenMatch = response.data.match(/(EAAG\w+)/);
    
    if (tokenMatch) {
      console.log('Token extracted successfully');
      return tokenMatch[1];
    } else {
      // Try alternative extraction method
      const altMatch = response.data.match(/"accessToken":"([^"]+)"/);
      if (altMatch) {
        console.log('Token extracted via alternative method');
        return altMatch[1];
      }
      console.log('No token found in response');
      return null;
    }
  } catch (err) {
    console.error('Token extraction error:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response headers:', err.response.headers);
    }
    return null;
  }
}

// Share function with retry logic
async function sharePost(token, post_link, ua, cookie, attempt = 1) {
  try {
    console.log(`Share attempt ${attempt} for link: ${post_link.substring(0, 50)}...`);
    
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
          "User-Agent": ua,
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": cookie,
          "Origin": "https://www.facebook.com",
          "Referer": "https://www.facebook.com/"
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.id) {
      console.log(`Share successful: ${response.data.id}`);
      return {
        success: true,
        id: response.data.id,
        message: 'Shared successfully'
      };
    } else {
      console.log('Share response missing ID:', response.data);
      return {
        success: false,
        message: 'No post ID returned'
      };
    }
  } catch (err) {
    console.error(`Share attempt ${attempt} failed:`, err.message);
    
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
      
      // Handle specific Facebook API errors
      const errorData = err.response.data?.error || {};
      const errorCode = errorData.code;
      const errorMessage = errorData.message || err.message;
      
      // Retry logic for certain errors
      if (attempt < 3 && 
          (errorCode === 368 || errorCode === 4 || errorCode === 17)) {
        console.log(`Retrying (${attempt}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        return sharePost(token, post_link, ua, cookie, attempt + 1);
      }
      
      return {
        success: false,
        message: `Facebook API Error (${errorCode}): ${errorMessage}`,
        errorCode: errorCode
      };
    }
    
    return {
      success: false,
      message: `Network error: ${err.message}`
    };
  }
}

// Real-time progress via WebSocket/SSE
const clients = new Map();

// SSE endpoint for live progress
app.get('/api/progress/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  clients.set(sessionId, res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);
  
  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);
  
  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(sessionId);
  });
});

function sendProgress(sessionId, data) {
  const client = clients.get(sessionId);
  if (client) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// Main share endpoint - supports batch processing
app.post("/api/share", async (req, res) => {
  const { cookie, link: post_link, limit = 1, sessionId } = req.body;
  const limitNum = parseInt(limit, 10);
  
  console.log('Share request received:', {
    linkLength: post_link?.length,
    limit: limitNum,
    sessionId: sessionId,
    hasCookie: !!cookie
  });

  // Validation
  if (!cookie || !post_link) {
    return res.status(400).json({ 
      status: false, 
      message: "Missing required fields: cookie and link are required." 
    });
  }

  if (!post_link.includes('facebook.com')) {
    return res.status(400).json({ 
      status: false, 
      message: "Invalid Facebook URL. Please provide a valid Facebook post link." 
    });
  }

  if (limitNum < 1 || limitNum > 999999) {
    return res.status(400).json({ 
      status: false, 
      message: "Limit must be between 1 and 999,999." 
    });
  }

  try {
    // Select random user agent
    const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
    
    // Send progress: token extraction started
    if (sessionId) {
      sendProgress(sessionId, {
        type: 'progress',
        stage: 'token_extraction',
        message: 'Extracting Facebook token...',
        progress: 10
      });
    }

    // Extract token
    const token = await extract_token(cookie, ua);
    
    if (!token) {
      if (sessionId) {
        sendProgress(sessionId, {
          type: 'error',
          message: 'Token extraction failed. Please check your cookie.',
          progress: 100
        });
      }
      return res.status(401).json({ 
        status: false, 
        message: "Token extraction failed. Please check your Facebook cookie and try again." 
      });
    }

    // Send progress: token extracted
    if (sessionId) {
      sendProgress(sessionId, {
        type: 'progress',
        stage: 'token_extracted',
        message: 'Token extracted successfully!',
        progress: 30
      });
    }

    // Process shares with batch support
    let success = 0;
    let failed = 0;
    const results = [];
    const BATCH_SIZE = 5; // Process 5 at a time for stability
    const totalBatches = Math.ceil(limitNum / BATCH_SIZE);
    
    console.log(`Starting ${limitNum} shares in ${totalBatches} batches`);

    for (let batch = 0; batch < totalBatches; batch++) {
      const currentBatchSize = Math.min(BATCH_SIZE, limitNum - (batch * BATCH_SIZE));
      
      // Send progress: batch starting
      if (sessionId) {
        sendProgress(sessionId, {
          type: 'progress',
          stage: 'sharing',
          message: `Processing batch ${batch + 1}/${totalBatches}...`,
          current: (batch * BATCH_SIZE),
          total: limitNum,
          progress: 40 + (batch * (50 / totalBatches))
        });
      }

      // Process current batch
      const batchPromises = [];
      for (let i = 0; i < currentBatchSize; i++) {
        batchPromises.push(
          sharePost(token, post_link, ua, cookie)
            .then(result => {
              if (result.success) {
                success++;
                
                // Send individual success progress
                if (sessionId) {
                  sendProgress(sessionId, {
                    type: 'share_success',
                    current: success + failed,
                    total: limitNum,
                    message: `Shared ${success} of ${limitNum}`,
                    shareId: result.id
                  });
                }
              } else {
                failed++;
                
                // Send individual failure progress
                if (sessionId) {
                  sendProgress(sessionId, {
                    type: 'share_failed',
                    current: success + failed,
                    total: limitNum,
                    message: `Failed: ${result.message}`,
                    error: result.message
                  });
                }
              }
              results.push(result);
              return result;
            })
            .catch(err => {
              failed++;
              console.error('Batch share error:', err.message);
              return { success: false, message: err.message };
            })
        );
      }

      // Wait for current batch to complete
      await Promise.allSettled(batchPromises);
      
      // Small delay between batches to avoid rate limiting
      if (batch < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // Send final progress
    if (sessionId) {
      sendProgress(sessionId, {
        type: 'complete',
        success: success,
        failed: failed,
        total: limitNum,
        message: `Completed: ${success} successful, ${failed} failed`,
        progress: 100
      });
      
      // Close SSE connection
      setTimeout(() => {
        const client = clients.get(sessionId);
        if (client) {
          client.write(`data: ${JSON.stringify({ type: 'close' })}\n\n`);
          client.end();
          clients.delete(sessionId);
        }
      }, 5000);
    }

    console.log(`Share process completed: ${success} successful, ${failed} failed`);

    // Return final response
    res.json({
      status: true,
      message: success > 0 ? 
        `✅ Successfully shared ${success} times. ${failed > 0 ? `(${failed} failed)` : ''}` :
        '❌ No shares were successful',
      success_count: success,
      failed_count: failed,
      total_attempted: limitNum,
      results: results.slice(0, 10) // Return first 10 results
    });

  } catch (error) {
    console.error('Unexpected error in share endpoint:', error);
    
    if (sessionId) {
      sendProgress(sessionId, {
        type: 'error',
        message: `Server error: ${error.message}`,
        progress: 100
      });
    }
    
    res.status(500).json({
      status: false,
      message: `Server error: ${error.message}`,
      success_count: 0,
      failed_count: 0
    });
  }
});

// New endpoint: Single share (for testing)
app.post("/api/share/single", async (req, res) => {
  const { cookie, link: post_link } = req.body;
  
  if (!cookie || !post_link) {
    return res.status(400).json({ 
      status: false, 
      message: "Missing cookie or link" 
    });
  }
  
  try {
    const ua = ua_list[0];
    const token = await extract_token(cookie, ua);
    
    if (!token) {
      return res.status(401).json({ 
        status: false, 
        message: "Token extraction failed" 
      });
    }
    
    const result = await sharePost(token, post_link, ua, cookie);
    
    res.json({
      status: result.success,
      message: result.message,
      share_id: result.id,
      error_code: result.errorCode
    });
    
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
});

// New endpoint: Validate cookie
app.post("/api/validate", async (req, res) => {
  const { cookie } = req.body;
  
  if (!cookie) {
    return res.status(400).json({ 
      status: false, 
      message: "No cookie provided" 
    });
  }
  
  try {
    const ua = ua_list[0];
    const token = await extract_token(cookie, ua);
    
    if (token) {
      res.json({
        status: true,
        message: "Cookie is valid",
        token_length: token.length
      });
    } else {
      res.json({
        status: false,
        message: "Cookie is invalid or expired"
      });
    }
    
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    clients: clients.size
  });
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    status: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing HTTP server...');
  
  // Close all SSE connections
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify({ type: 'server_shutdown' })}\n\n`);
    client.end();
  });
  
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════╗
║     Facebook Share Tool Backend      ║
║                                      ║
║  🚀 Server is running!              ║
║  📍 http://${HOST}:${PORT}           ║
║  📁 Static files: /public           ║
║  🔗 API: /api/share                 ║
║  📊 Live progress: /api/progress/:id║
║  🩺 Health: /api/health             ║
╚══════════════════════════════════════╝
  `);
  
  // Log environment info
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
});

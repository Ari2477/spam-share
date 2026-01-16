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

// Serve the single HTML file for all routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/share', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    // Unlimited mode - use 10000 as max for safety
    limitNum = 10000;
    console.log('♾️ Unlimited mode - Max 10,000 shares');
  } else {
    // Limited mode - validate 100-10000
    limitNum = parseInt(limit, 10);
    
    if (isNaN(limitNum)) {
      console.log('❌ Invalid limit number');
      return res.json({ status: false, message: "Please enter a valid number of shares." });
    }
    
    // FRONTEND SYNC: 100-10000 shares validation
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

  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const token = await extract_token(cookie, ua);
  
  if (!token) {
    console.log('❌ Token extraction failed');
    return res.json({ status: false, message: "Token extraction failed. Please check your cookie." });
  }

  console.log('✅ Token extracted successfully');
  console.log(`🔄 Starting ${isUnlimited ? 'unlimited (max 10k)' : limitNum} shares with ${delayMs}ms delay`);

  let success = 0;
  let errors = 0;
  const maxErrors = 3; // Stop after 3 consecutive errors
  
  // For progress logging
  const logInterval = Math.max(1, Math.floor(limitNum / 10)); // Log every 10%
  
  for (let i = 0; i < limitNum; i++) {
    try {
      // Log progress
      if (i % logInterval === 0 || i === limitNum - 1) {
        const progress = Math.round((i / limitNum) * 100);
        console.log(`📊 Progress: ${progress}% (${i}/${limitNum}) - ${success} successful`);
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
          }
        }
      );
      
      if (response.data.id) {
        success++;
        errors = 0; // Reset error counter
        
        // Add delay between shares if not the last one
        if (i < limitNum - 1 && delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        console.log('❌ No ID returned from Facebook');
        errors++;
        if (errors >= maxErrors) {
          console.log(`🛑 Stopping due to ${maxErrors} consecutive errors`);
          break;
        }
      }
    } catch (err) {
      console.error('❌ Share error:', err.message);
      errors++;
      
      // Enhanced error handling
      if (err.response) {
        const errorData = err.response.data;
        
        // Token expired (190)
        if (errorData.error && errorData.error.code === 190) {
          return res.json({ 
            status: false, 
            message: "Access token expired. Please refresh your cookie.", 
            success_count: success 
          });
        }
        
        // Rate limiting (429 or 4)
        if (err.response.status === 429 || (errorData.error && errorData.error.code === 4)) {
          return res.json({ 
            status: false, 
            message: "Rate limited by Facebook. Please try again later.", 
            success_count: success 
          });
        }
        
        // Permission error (10)
        if (errorData.error && errorData.error.code === 10) {
          return res.json({ 
            status: false, 
            message: "Permission denied. Your cookie may not have sharing permissions.", 
            success_count: success 
          });
        }
        
        // Show Facebook error message if available
        if (errorData.error && errorData.error.message) {
          console.error('Facebook Error:', errorData.error.message);
        }
      }
      
      if (errors >= maxErrors) {
        console.log(`🛑 Stopping due to ${maxErrors} consecutive errors`);
        break;
      }
      
      // Wait before retrying after error
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`🎯 Completed: ${success} successful shares out of ${limitNum} attempted`);
  
  // Generate appropriate message
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
    unlimited_mode: isUnlimited
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`=========================================`);
  console.log(`🚀 Facebook Share Tool Server Started`);
  console.log(`📡 Port: ${port}`);
  console.log(`🌐 http://localhost:${port}`);
  console.log(`⚙️  Configuration:`);
  console.log(`   • Shares Range: 100 - 10,000`);
  console.log(`   • No Limit Mode: Enabled (max 10k)`);
  console.log(`   • Delay Range: 1ms - 10,000ms`);
  console.log(`   • Default Delay: 1ms`);
  console.log(`=========================================`);
});

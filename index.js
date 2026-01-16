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

  if (!cookie || !post_link) {
    return res.json({ status: false, message: "Missing cookie or link." });
  }

  // If unlimited, use a very large number or infinite loop with stop condition
  let limitNum;
  if (isUnlimited) {
    limitNum = 999999; // Very high number for "unlimited"
  } else {
    limitNum = parseInt(limit, 10);
    if (!limitNum || limitNum < 1) {
      return res.json({ status: false, message: "Please enter a valid number of shares." });
    }
  }

  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const token = await extract_token(cookie, ua);
  if (!token) {
    return res.json({ status: false, message: "Token extraction failed." });
  }

  let success = 0;
  let shouldContinue = true;
  
  // For unlimited mode, add a timeout or max iterations
  const maxUnlimitedShares = 1000; // Safety limit for unlimited mode
  const actualLimit = isUnlimited ? maxUnlimitedShares : limitNum;

  for (let i = 0; i < actualLimit && shouldContinue; i++) {
    try {
      console.log(`🔄 Sharing ${i + 1}/${isUnlimited ? '∞' : limitNum} (${success} successful)`);
      
      const response = await axios.post(
        "https://graph.facebook.com/v18.0/me/feed",
        null,
        {
          params: { link: post_link, access_token: token, published: 0 },
          headers: {
            "user-agent": ua,
            "Cookie": cookie
          }
        }
      );
      
      if (response.data.id) {
        success++;
        
        // Add delay between shares if not the last one
        if (i < actualLimit - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        console.log('❌ No ID returned, stopping...');
        shouldContinue = false;
        break;
      }
    } catch (err) {
      console.error('❌ Share error:', err.message);
      
      // Check if error is due to rate limiting or token expiry
      if (err.response && err.response.status === 400) {
        const errorData = err.response.data;
        if (errorData.error && errorData.error.code === 190) {
          // Access token expired
          return res.json({ 
            status: false, 
            message: "Access token expired. Please refresh your cookie.", 
            success_count: success 
          });
        } else if (errorData.error && errorData.error.code === 4) {
          // Rate limited
          return res.json({ 
            status: false, 
            message: "Rate limited by Facebook. Please try again later.", 
            success_count: success 
          });
        }
      }
      
      shouldContinue = false;
      break;
    }
  }

  let message;
  if (isUnlimited) {
    message = `✅ Unlimited sharing completed. Shared ${success} times before stopping.`;
  } else {
    message = `✅ Shared ${success} out of ${limitNum} times with ${delayMs}ms delay.`;
  }

  res.json({
    status: true,
    message: message,
    success_count: success,
    unlimited_mode: isUnlimited
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

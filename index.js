const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());  // For parsing JSON bodies
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'public')); // Set views to public directory

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
  const { cookie, link: post_link, limit, delay } = req.body;
  const limitNum = parseInt(limit, 10);
  const delayMs = parseInt(delay, 10) || 1000; // Default 1 second delay

  if (!cookie || !post_link || !limitNum) {
    return res.json({ status: false, message: "Missing input." });
  }

  const ua = ua_list[Math.floor(Math.random() * ua_list.length)];
  const token = await extract_token(cookie, ua);
  if (!token) {
    return res.json({ status: false, message: "Token extraction failed." });
  }

  let success = 0;
  for (let i = 0; i < limitNum; i++) {
    try {
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
        if (i < limitNum - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } else {
        break;
      }
    } catch (err) {
      console.error('Share error:', err.message);
      break;
    }
  }

  res.json({
    status: true,
    message: `✅ Shared ${success} times with ${delayMs}ms delay.`,
    success_count: success
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

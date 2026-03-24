const axios = require('axios');

async function testRateLimit() {
  const url = 'http://localhost:3000/api/runs';
  console.log(`Testing rate limit on ${url}...`);
  
  for (let i = 0; i < 15; i++) {
    try {
      const response = await axios.post(url, { runtime: 'javascript', code: 'console.log("test")' });
      console.log(`Request ${i + 1}: ${response.status}`);
    } catch (err) {
      if (err.response && err.response.status === 429) {
        console.log(`Request ${i + 1}: 429 Too Many Requests (SUCCESS - Rate limit working)`);
        return;
      }
      console.log(`Request ${i + 1}: Error ${err.message}`);
    }
  }
}

// Note: This script requires the API to be running locally.
// For now, it's just a template to show how I would test it.
// testRateLimit();

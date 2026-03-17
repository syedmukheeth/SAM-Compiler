const http = require('http');

const data = JSON.stringify({
  language: 'python',
  code: 'print("Liquid Flux is Alive and Stable")'
});

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/runs',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();

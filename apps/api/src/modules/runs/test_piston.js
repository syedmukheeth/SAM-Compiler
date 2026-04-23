const https = require("https");

const payload = JSON.stringify({
  language: "c",
  version: "*",
  files: [
    {
      name: "main.c",
      content: "#include <stdio.h>\nint main() { printf(\"Hello Piston\\n\"); return 0; }"
    }
  ]
});

const req = https.request("https://emkc.org/api/v2/piston/execute", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  }
}, (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => {
    console.log(res.statusCode);
    console.log(data);
  });
});
req.write(payload);
req.end();

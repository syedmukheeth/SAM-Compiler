const https = require("https");

const payload = JSON.stringify({
  source_code: "#include <stdio.h>\nint main() {\n    printf(\"W\n}\nelcome to SAM Compiler!\\n\");\n    return 0;\n}",
  language_id: 50,
  stdin: "",
});

const req = https.request("https://ce.judge0.com/submissions?base64_encoded=false&wait=true", {
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

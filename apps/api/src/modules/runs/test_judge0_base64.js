const https = require("https");

const payload = JSON.stringify({
  source_code: Buffer.from("#include <stdio.h>\nint main() {\n    printf(\"W\n}\nelcome to SAM Compiler!\\n\");\n    return 0;\n}").toString("base64"),
  language_id: 50,
  stdin: Buffer.from("").toString("base64"),
});

const req = https.request("https://ce.judge0.com/submissions?base64_encoded=true&wait=true", {
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
    const result = JSON.parse(data);
    if (result.stdout) result.stdout = Buffer.from(result.stdout, "base64").toString("utf8");
    if (result.stderr) result.stderr = Buffer.from(result.stderr, "base64").toString("utf8");
    if (result.compile_output) result.compile_output = Buffer.from(result.compile_output, "base64").toString("utf8");
    console.log(result);
  });
});
req.write(payload);
req.end();

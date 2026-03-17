const { connectMongo } = require("./src/config/mongo");
const { createRun } = require("./src/modules/runs/runs.service");
require("dotenv").config();

async function check() {
  try {
    await connectMongo();
    console.log("Connected to Mongo");
    
    const run = await createRun({
      projectId: "test",
      runtime: "nodejs",
      entrypoint: "index.js",
      files: [{ path: "index.js", content: "console.log('hi')" }]
    });
    console.log("Run created successfully:", run._id);
    process.exit(0);
  } catch (err) {
    console.error("FAILED CHECK:");
    console.error(err);
    process.exit(1);
  }
}

check();

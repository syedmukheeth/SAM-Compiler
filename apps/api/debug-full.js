const { connectMongo } = require("./src/config/mongo");
const { createRun } = require("./src/modules/runs/runs.service");

async function debug() {
  try {
    await connectMongo();
    console.log("Mongo OK");
    
    await createRun({
      projectId: "debug",
      runtime: "python",
      entrypoint: "main.py",
      files: [{ path: "main.py", content: "print('debug')" }]
    });
    console.log("createRun finished successfully");
    process.exit(0);
  } catch (err) {
    if (err.name === 'ValidationError') {
      console.error("VALIDATION ERRORS:");
      for (let field in err.errors) {
        console.error(`${field}: ${err.errors[field].message}`);
      }
    } else {
      console.error("FATAL ERROR:");
      console.error(err);
    }
    process.exit(1);
  }
}

debug();

const { RunModel } = require("./runs.model");
const { runsQueue } = require("./runs.queue");

async function createRun(input) {
  const run = await RunModel.create({
    projectId: input.projectId,
    runtime: input.runtime,
    status: "queued",
    entrypoint: input.entrypoint,
    files: input.files,
    stdout: "",
    stderr: "",
    exitCode: null,
    startedAt: null,
    finishedAt: null
  });

  await runsQueue.add(
    "execute",
    { runId: run._id.toString() },
    {
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600, count: 1000 }
    }
  );

  return run;
}

async function getRun(runId) {
  return await RunModel.findById(runId).lean();
}

module.exports = { createRun, getRun };


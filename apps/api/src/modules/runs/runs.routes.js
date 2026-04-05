const { Router } = require("express");
const { z } = require("zod");
const { createRun, getRun, getQueueStatus, getUserHistory } = require("./runs.service");
const { authMiddleware, optionalAuth } = require("../../middleware/auth.middleware");

const runsRouter = Router();


const CreateRunSchema = z.object({
  language: z.enum(["nodejs", "javascript", "python", "cpp", "c", "java"]),
  code: z.string().min(1)
});

runsRouter.post("/", optionalAuth, async (req, res, next) => {
  try {
    const { language, code } = CreateRunSchema.parse(req.body);
    const userId = req.user ? req.user.id : null;
    const runtime = (language === "javascript" || language === "nodejs") ? "javascript" : language;
    
    // Transform simplified payload to existing internal run format
    const run = await createRun({
      projectId: "playground",
      userId,
      runtime: runtime,
      entrypoint: language === "java" ? "Solution.java" : language === "python" ? "solution.py" : language === "cpp" ? "solution.cpp" : language === "c" ? "solution.c" : "solution.js",
      files: [{
        path: language === "java" ? "Solution.java" : language === "python" ? "solution.py" : language === "cpp" ? "solution.cpp" : language === "c" ? "solution.c" : "solution.js",
        content: code
      }]
    });
    
    res.status(201).json({ jobId: run._id.toString(), status: run.status });
  } catch (err) {
    next(err);
  }
});

runsRouter.get("/:runId", async (req, res, next) => {
  try {
    const run = await getRun(req.params.runId);
    if (!run) return res.status(404).json({ message: "Run not found" });
    res.json({
      runId: run._id.toString(),
      status: run.status,
      exitCode: run.exitCode ?? null,
      stdout: run.stdout ?? "",
      stderr: run.stderr ?? "",
      startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
      finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null
    });
  } catch (err) {
    next(err);
  }
});

runsRouter.get("/history", authMiddleware, async (req, res, next) => {
  try {
    const history = await getUserHistory(req.user.id);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

runsRouter.get("/health/queue", async (req, res, next) => {
  try {
    const status = await getQueueStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});


// eslint-disable-next-line no-unused-vars

runsRouter.use((err, _req, res, next) => {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Invalid request", issues: err.issues });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ message: "Internal error" });
});

module.exports = { runsRouter };


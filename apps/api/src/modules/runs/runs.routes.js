const { Router } = require("express");
const { z } = require("zod");
const { createRun, getRun, getQueueStatus, getUserHistory } = require("./runs.service");
const { authMiddleware, optionalAuth } = require("../../middleware/auth.middleware");
const { userRateLimiter } = require("../../middleware/rateLimiter.middleware");
const { logger } = require("../../config/logger");
const { signRunToken, verifyRunToken } = require("./runToken");
const { runtimeFilename } = require("./pistonExecutor");

const runsRouter = Router();


const CreateRunSchema = z.object({
  language: z.enum(["nodejs", "javascript", "python", "cpp", "c", "java"]),
  code: z.string().min(1),
  stdin: z.string().optional().default("")
});

// optionalAuth must run before userRateLimiter so that req.user exists and the
// per-user quota can actually be enforced.
runsRouter.post("/", optionalAuth, userRateLimiter, async (req, res, next) => {
  try {
    const { language, code, stdin } = CreateRunSchema.parse(req.body);
    const userId = req.user ? req.user.id : null;
    const runtime = (language === "javascript" || language === "nodejs") ? "javascript" : language;
    // Java's entry file used to be named Solution.java while every seeded
    // template declares `class Main`, so the worker's compile command and the
    // file on disk disagreed. One helper now names the file for both entry
    // points.
    const filename = runtimeFilename(runtime);

    // Transform simplified payload to existing internal run format
    const run = await createRun({
      projectId: "playground",
      userId,
      runtime: runtime,
      stdin: stdin || "",
      entrypoint: filename,
      files: [{ path: filename, content: code }]
    });
    
    const jobId = run._id.toString();
    // Anonymous runs cannot be bound to an identity, so the creator gets a
    // capability token to read the result back with.
    const runToken = userId ? undefined : signRunToken(jobId);

    res.status(201).json({ jobId, status: run.status, ...(runToken ? { runToken } : {}) });
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

// IDOR fix: this route previously had no auth and no ownership check, so any
// caller who guessed a 24-hex ObjectId could read another user's stdout/stderr.
// The socket path (socketHandler subscribe) already checked ownership; the REST
// path did not. Ownership semantics mirror it: a run with no userId is a guest
// run and is only readable by an unauthenticated caller in the same session
// sense (we cannot bind it to anyone), while an owned run requires a match.
runsRouter.get("/:runId", optionalAuth, async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.runId)) {
      return res.status(400).json({ message: "Invalid run id" });
    }
    const run = await getRun(req.params.runId);
    if (!run) return res.status(404).json({ message: "Run not found" });

    const requesterId = req.user?.id ? String(req.user.id) : null;
    const ownerId = run.userId ? String(run.userId) : null;

    if (ownerId) {
      // Owned run: only the owner may read it. 404 rather than 403 so the
      // endpoint does not confirm that an id exists.
      if (requesterId !== ownerId) {
        return res.status(404).json({ message: "Run not found" });
      }
    } else {
      // Anonymous run: readable only by whoever created it, proven by the
      // capability token issued at creation. Without this, knowing or guessing
      // an ObjectId was enough to read any guest's code output.
      const presented = req.get("X-Run-Token") || req.query.runToken;
      if (!verifyRunToken(req.params.runId, presented)) {
        return res.status(404).json({ message: "Run not found" });
      }
    }

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


runsRouter.get("/health/queue", async (req, res, next) => {
  try {
    const status = await getQueueStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});


runsRouter.use((err, _req, res, _next) => { // eslint-disable-line no-unused-vars
  if (err instanceof z.ZodError) {
    return res.status(400).json({ message: "Invalid request", issues: err.issues });
  }
  logger.error({ err }, "Runs route error");
  return res.status(500).json({ message: "Internal error" });
});

module.exports = { runsRouter };


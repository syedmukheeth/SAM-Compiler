const express = require("express");
const { z } = require("zod");
const { pushToGithub } = require("./github.service");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { getUserWithGithubToken } = require("../auth/auth.service");
const router = express.Router();

// These fields were previously presence-checked only: types were unchecked and
// `content` was unbounded up to the 2MB JSON body cap.
const PushSchema = z.object({
  repo: z.string().trim().min(1).max(200),
  path: z.string().trim().min(1).max(400),
  content: z.string().max(1_000_000),
  message: z.string().trim().max(500).optional(),
  branch: z.string().trim().max(200).optional()
});

router.get("/repos", authMiddleware, async (req, res, next) => {
  const { getUserRepos } = require("./github.service");
  try {
    const fullUser = await getUserWithGithubToken(req.user.id);
    const repos = await getUserRepos({ user: fullUser });
    res.json(repos);
  } catch (err) {
    next(err);
  }
});

router.post("/push", authMiddleware, async (req, res, next) => {
  const parsed = PushSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid request", issues: parsed.error.issues.map((i) => i.path) });
  }

  try {
    // Fetch full user to get githubToken (not stored in JWT). A caller-supplied
    // token is deliberately NOT accepted - see github.service.pushToGithub.
    const fullUser = await getUserWithGithubToken(req.user.id);

    const result = await pushToGithub({ ...parsed.data, user: fullUser });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = { githubRouter: router };

const express = require("express");
const { pushToGithub } = require("./github.service");
const { authMiddleware } = require("../../middleware/auth.middleware");
const router = express.Router();

router.post("/push", authMiddleware, async (req, res, next) => {
  const { token, repo, path, content, message } = req.body;

  if (!repo || !path || !content) {
    return res.status(400).json({ message: "Missing required fields (repo, path, content)" });
  }

  try {
    const result = await pushToGithub({ 
      token: token || req.user.githubToken, 
      repo, 
      path, 
      content, 
      message,
      user: req.user 
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = { githubRouter: router };

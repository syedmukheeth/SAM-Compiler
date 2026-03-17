const express = require("express");
const { pushToGithub } = require("./github.service");
const router = express.Router();

router.post("/push", async (req, res, next) => {
  const { token, repo, path, content, message } = req.body;

  if (!token || !repo || !path || !content) {
    return res.status(400).json({ message: "Missing required fields (token, repo, path, content)" });
  }

  try {
    const result = await pushToGithub({ token, repo, path, content, message });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = { githubRouter: router };

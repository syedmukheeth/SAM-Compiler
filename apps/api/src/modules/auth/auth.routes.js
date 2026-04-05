const express = require("express");
const { register, login, getUserById, generateToken } = require("./auth.service");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { env } = require("../../config/env");
const passport = require("passport");
const router = express.Router();

// Social Auth Redirects
router.get("/github", (req, res, next) => {
  if (!env.GITHUB_CLIENT_ID || env.GITHUB_CLIENT_ID === "placeholder") {

    return res.status(400).json({ 
      message: "GitHub Integration is not configured. Please add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to your environment variables." 
    });
  }
  passport.authenticate("github", { scope: ["user:email", "repo"], session: false })(req, res, next);
});


router.get("/google", (req, res, next) => {
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID === "placeholder") {
    return res.status(400).json({ message: "Google Social Login is not configured. Please add GOOGLE_CLIENT_ID to .env" });
  }
  passport.authenticate("google", { scope: ["profile", "email"], session: false })(req, res, next);
});

// Social Auth Callbacks
router.get("/github/callback", (req, res, next) => {
  const frontendUrl = process.env.NODE_ENV === "production" 
      ? "https://sam-compiler-web.vercel.app" 
      : env.WEB_ORIGIN;
      
  passport.authenticate("github", { 
    failureRedirect: `${frontendUrl}/login`, 
    session: false 
  }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${frontendUrl}/login?error=auth_failed`);
    }

    const token = generateToken(user);
    res.redirect(`${frontendUrl}/?token=${token}`);
  })(req, res, next);
});


router.get("/google/callback", (req, res, next) => {
  const frontendUrl = process.env.NODE_ENV === "production" 
      ? "https://sam-compiler-web.vercel.app" 
      : env.WEB_ORIGIN;

  passport.authenticate("google", { 
    failureRedirect: `${frontendUrl}/login`, 
    session: false 
  }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${frontendUrl}/login?error=auth_failed`);
    }

    const token = generateToken(user);
    res.redirect(`${frontendUrl}/?token=${token}`);
  })(req, res, next);
});


router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// eslint-disable-next-line no-unused-vars
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const result = await register({ name, email, password });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// eslint-disable-next-line no-unused-vars
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Missing email or password" });
    }
    const result = await login({ email, password });
    res.json(result);
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
});

module.exports = { authRouter: router };

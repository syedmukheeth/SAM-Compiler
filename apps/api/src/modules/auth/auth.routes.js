const express = require("express");
const rateLimit = require("express-rate-limit");
const { 
  register, 
  login, 
  getUserById, 
  generateToken, 
  generateResetToken, 
  resetPassword 
} = require("./auth.service");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { env } = require("../../config/env");
const passport = require("passport");
const EmailService = require("../../services/email.service");

const router = express.Router();

// 🔐 SECURITY: Rate limiting for auth routes to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: { message: "Too many login/register attempts. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});


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
  const frontendUrl = "https://sam-compiler-web.vercel.app";
      
  passport.authenticate("github", { 
    failureRedirect: `${frontendUrl}/?error=auth_failed`, 
    session: false 
  }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${frontendUrl}/?error=auth_failed`);
    }

    const token = generateToken(user);
    res.redirect(`${frontendUrl}/?token=${token}`);
  })(req, res, next);
});


router.get("/google/callback", (req, res, next) => {
  const frontendUrl = "https://sam-compiler-web.vercel.app";

  passport.authenticate("google", { 
    failureRedirect: `${frontendUrl}/?error=auth_failed`, 
    session: false 
  }, (err, user) => {
    if (err || !user) {
      return res.redirect(`${frontendUrl}/?error=auth_failed`);
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
router.post("/register", authLimiter, async (req, res, next) => {
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
router.post("/login", authLimiter, async (req, res, next) => {
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

// 📬 RECOVER: Forgot Password Flow
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const token = await generateResetToken(email);
    await EmailService.sendPasswordResetEmail(email, token);

    res.json({ message: "If an account exists, a reset link has been sent." });
  } catch (err) {
    console.error(`[AUTH] Forgot password error: ${err.message}`);
    // Return success anyway to prevent enumeration
    res.json({ message: "If an account exists, a reset link has been sent." });
  }
});

router.post("/reset-password", authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }

    await resetPassword(token, password);
    res.json({ message: "Password has been reset successfully." });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = { authRouter: router };

const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const {
  register, 
  login, 
  getUserById, 
  generateToken, 
  generateResetToken, 
  resetPassword 
} = require("./auth.service");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { logger } = require("../../config/logger");
const { env } = require("../../config/env");
const passport = require("passport");
const EmailService = require("../../services/email.service");

const router = express.Router();

// First entry of WEB_ORIGIN. The OAuth callbacks hardcoded one Vercel domain,
// so sign-in always bounced there no matter where the API was running.
const webOrigin = () => {
  const first = (env.WEB_ORIGIN || "").split(",")[0].trim().replace(/\/+$/, "");
  return first || "http://localhost:5174";
};

/**
 * SECURITY: strict body schemas.
 *
 * These fields previously reached `User.findOne({ email })` unvalidated, so a
 * JSON body like {"email":{"$ne":null}} was passed to Mongo as an operator
 * query and selected an arbitrary user document. z.string() rejects any
 * non-string, which closes that. It also gives passwords a minimum length;
 * there was no password policy anywhere, so a 1-character password was accepted
 * by both register and reset.
 */
const MIN_PASSWORD_LENGTH = 8;
const emailField = z.string().trim().min(3).max(254).email();
const passwordField = z.string().min(MIN_PASSWORD_LENGTH).max(200);

const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailField,
  password: passwordField
});
// Login must not impose the new length policy, or existing accounts with
// shorter passwords could no longer sign in. Type safety is what matters here.
const LoginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(200)
});
const ForgotPasswordSchema = z.object({ email: emailField });
const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  password: passwordField
});

function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      message: "Invalid request",
      issues: result.error.issues.map((i) => ({ path: i.path, code: i.code }))
    });
    return null;
  }
  return result.data;
}

// SECURITY: Rate limiting for auth routes to prevent brute force
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
  const frontendUrl = webOrigin();
      
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
  const frontendUrl = webOrigin();

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
    logger.error({ err }, "Failed to load current user");
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/register", authLimiter, async (req, res) => {
  const body = parseBody(RegisterSchema, req, res);
  if (!body) return;
  try {
    const result = await register(body);
    res.status(201).json(result);
  } catch (err) {
    // "Email already registered" is the only expected failure; anything else is
    // internal and must not surface a Mongo/Mongoose message to the client.
    const isKnown = err.message === "Email already registered";
    logger.warn({ err }, "Registration failed");
    res.status(isKnown ? 409 : 500).json({
      message: isKnown ? err.message : "Registration failed"
    });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  const body = parseBody(LoginSchema, req, res);
  if (!body) return;
  try {
    const result = await login(body);
    res.json(result);
  } catch (err) {
    logger.warn({ err: err.message }, "Login failed");
    res.status(401).json({ message: "Invalid credentials" });
  }
});

// RECOVER: Forgot Password Flow
router.post("/forgot-password", authLimiter, async (req, res) => {
  const body = parseBody(ForgotPasswordSchema, req, res);
  if (!body) return;
  try {
    const token = await generateResetToken(body.email);
    await EmailService.sendPasswordResetEmail(body.email, token);
  } catch (err) {
    logger.warn({ err: err.message }, "Forgot-password request failed");
  }
  // Always the same response, so the endpoint cannot be used to enumerate
  // which addresses have accounts.
  res.json({ message: "If an account exists, a reset link has been sent." });
});

router.post("/reset-password", authLimiter, async (req, res) => {
  const body = parseBody(ResetPasswordSchema, req, res);
  if (!body) return;
  try {
    await resetPassword(body.token, body.password);
    res.json({ message: "Password has been reset successfully." });
  } catch (err) {
    logger.warn({ err: err.message }, "Password reset failed");
    res.status(400).json({ message: "Reset link is invalid or has expired." });
  }
});

module.exports = { authRouter: router };

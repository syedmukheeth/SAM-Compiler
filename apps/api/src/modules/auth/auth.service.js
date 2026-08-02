const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("./user.model");
const { env } = require("../../config/env");

async function register({ name, email, password }) {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("Email already registered");
  }

  const user = await User.create({ name, email, password });
  const token = generateToken(user);

  return {
    user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar },
    token
  };
}

async function login({ email, password }) {
  const user = await User.findOne({ email });
  if (!user || user.provider !== 'email') {
    throw new Error("Invalid credentials");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error("Invalid credentials");
  }

  const token = generateToken(user);

  return {
    user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar },
    token
  };
}

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, tv: user.tokenVersion ?? 0 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

async function getUserById(id) {
  // githubToken is a full-scope OAuth token stored in plaintext; it must never
  // be serialised back to the browser (GET /api/auth/me previously returned it).
  const user = await User.findById(id).select("-password -githubToken -resetPasswordToken -resetPasswordExpires");
  return user;
}

/**
 * Server-side only. Returns the user document including the stored GitHub OAuth
 * token, for use by the GitHub push/list flows. Never send the result of this
 * to a client - use getUserById for anything that reaches a response body.
 */
async function getUserWithGithubToken(id) {
  return User.findById(id).select("-password -resetPasswordToken -resetPasswordExpires");
}

/**
 * FORGOT PASSWORD: Generate reset token
 */
async function generateResetToken(email) {
  const user = await User.findOne({ email, provider: 'email' });
  if (!user) throw new Error("No account found with that email.");

  // Generate 32-char hex token
  const resetToken = crypto.randomBytes(32).toString("hex");
  
  // Hash the token so we don't store the raw secret in DB
  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpires = Date.now() + 3600000; // 1 Hour

  await user.save();
  return resetToken; // Return the RAW token to the caller (it will be sent via email)
}

/**
 * RESET PASSWORD: Verify token and update password
 */
async function resetPassword(token, newPassword) {
  const hashedToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) throw new Error("Reset token is invalid or has expired.");

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  // Invalidate every JWT issued before this reset.
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;

  await user.save();
  return user;
}

module.exports = {
  register,
  login,
  generateToken,
  getUserById,
  getUserWithGithubToken,
  generateResetToken,
  resetPassword
};

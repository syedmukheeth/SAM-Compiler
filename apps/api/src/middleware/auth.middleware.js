const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { env } = require("../config/env");

/**
 * Confirms the token's version still matches the account.
 *
 * resetPassword() bumps User.tokenVersion, so any JWT minted before the reset
 * carries a stale `tv` and is rejected here. Tokens issued before this field
 * existed have no `tv` claim; those are allowed through so the change does not
 * sign every existing session out on deploy.
 */
async function tokenVersionValid(decoded) {
  if (decoded.tv === undefined) return true;
  // DB unavailable: fail open rather than lock every user out of the app.
  if (mongoose.connection.readyState < 1) return true;

  const User = mongoose.models.User;
  if (!User) return true;

  const user = await User.findById(decoded.id).select("tokenVersion").lean();
  if (!user) return false;
  return (user.tokenVersion ?? 0) === decoded.tv;
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!(await tokenVersionValid(decoded))) {
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }
    req.user = decoded; // { id, email, role }
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (await tokenVersionValid(decoded)) req.user = decoded;
    next();
  } catch {
    next();
  }
};

module.exports = { authMiddleware, optionalAuth, tokenVersionValid };

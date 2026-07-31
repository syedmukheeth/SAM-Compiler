const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: function() { return this.provider === 'email'; } },
  avatar: { type: String },
  provider: { type: String, enum: ['email', 'github', 'google'], default: 'email' },
  providerId: { type: String },
  githubToken: { type: String },
  githubUsername: { type: String },
  isVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  // Bumped on password reset so previously issued JWTs stop verifying. Without
  // it, a 7-day token kept working after the account owner reset their
  // password - the exact scenario a reset is meant to shut down.
  tokenVersion: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Every OAuth sign-in runs findOne({ provider, providerId }); without this it
// was a full collection scan on each login.
UserSchema.index({ provider: 1, providerId: 1 });
// generateResetToken/resetPassword look up by token + expiry. Sparse because
// only accounts with a reset in flight have one.
UserSchema.index({ resetPasswordToken: 1 }, { sparse: true });

// Hash password before saving
UserSchema.pre("save", async function(next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);

const { logger } = require("../config/logger");

/**
 * 📧 EMAIL SERVICE
 *
 * Sends real mail when SMTP is configured. When it is not, it logs that the
 * send was skipped — it does NOT print the reset URL. The previous version
 * console.logged the full reset link on every request, which wrote a working
 * account-takeover token into production stdout for anyone with log access.
 */
class EmailService {
  constructor() {
    this._transporter = null;
    this._transporterChecked = false;
  }

  get isConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  async getTransporter() {
    if (this._transporterChecked) return this._transporter;
    this._transporterChecked = true;

    if (!this.isConfigured) return null;

    try {
      const nodemailer = require("nodemailer");
      this._transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
    } catch (err) {
      logger.error({ err }, "Failed to initialise SMTP transport");
      this._transporter = null;
    }
    return this._transporter;
  }

  resetUrlFor(token) {
    const base = (process.env.WEB_ORIGIN || "").split(",")[0].trim() || "http://localhost:5174";
    return `${base}/reset-password?token=${encodeURIComponent(token)}`;
  }

  async sendPasswordResetEmail(email, token) {
    const resetUrl = this.resetUrlFor(token);
    const transporter = await this.getTransporter();

    if (!transporter) {
      // Never log the URL or the token.
      logger.warn(
        { type: "password_reset", configured: false },
        "SMTP is not configured; password reset email was not sent"
      );
      return false;
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Reset your SAM Compiler password",
      text: [
        "You asked to reset your SAM Compiler password.",
        "",
        `Open this link to choose a new one: ${resetUrl}`,
        "",
        "The link expires in 1 hour. If you did not request this, you can ignore this email."
      ].join("\n"),
      html: `
        <p>You asked to reset your SAM Compiler password.</p>
        <p><a href="${resetUrl}">Choose a new password</a></p>
        <p>The link expires in 1 hour. If you did not request this, you can ignore this email.</p>
      `
    });

    logger.info({ type: "password_reset" }, "Password reset email sent");
    return true;
  }
}

module.exports = new EmailService();

const pino = require("pino");
const logger = pino({ level: 'info' });

/**
 * 📧 EMAIL SERVICE
 * Handles system notifications and password resets.
 * Supports Simulation Mode if SMTP is not configured.
 */
class EmailService {
  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(email, token) {
    const resetUrl = `${process.env.WEB_ORIGIN}/reset-password?token=${token}`;
    
    // simulation: Just log the URL beautifully
    console.log("\n" + "=".repeat(60));
    console.log("             📧 [SIMULATION] PASSWORD RESET EMAIL");
    console.log("=".repeat(60));
    console.log(`TO:      ${email}`);
    console.log(`URL:     ${resetUrl}`);
    console.log(`EXPIRES: In 1 hour`);
    console.log("=".repeat(60) + "\n");

    logger.info({ email, type: 'password_reset' }, 'Password reset email simulated');
    
    // In production, you would use nodemailer here:
    // await transporter.sendMail({ ... });
    
    return true;
  }

  async sendWelcomeEmail(email, name) {
    console.log(`[SIMULATION] Sending welcome email to ${name} (${email})`);
    return true;
  }
}

module.exports = new EmailService();

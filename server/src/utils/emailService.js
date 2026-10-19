const nodemailer = require('nodemailer');

// Configure mail transporter
function getTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Fallback for development: logs formatted emails to console or preview
  return null;
}

async function sendPasswordResetEmail(toEmail, rawToken) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}#reset-password?token=${rawToken}&email=${encodeURIComponent(toEmail)}`;

  const transporter = getTransporter();

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"NMIMS Peer Buddy" <no-reply@nmims.in>',
        to: toEmail,
        subject: 'NMIMS Peer Buddy — Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px;">
            <h2 style="color: #E4574C;">NMIMS Peer Buddy System</h2>
            <p>Hello,</p>
            <p>We received a request to reset your password for your NMIMS Peer Buddy account.</p>
            <p style="margin: 24px 0;">
              <a href="${resetLink}" style="background-color: #E4574C; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
            </p>
            <p style="color: #6B7280; font-size: 14px;">This link will expire in 30 minutes and can only be used once.</p>
            <p style="color: #6B7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;" />
            <p style="color: #9CA3AF; font-size: 12px;">Or copy and paste this link in your browser:<br/>${resetLink}</p>
          </div>
        `
      });
      console.log(`[Email] Password reset email dispatched via SMTP to ${toEmail}`);
      return { sent: true };
    } catch (err) {
      console.error('[Email] SMTP send failed:', err.message);
      return { sent: false, error: err.message };
    }
  } else {
    // When SMTP credentials are not configured, print the development reset link to the console for testing
    console.log('\n====================================================================');
    console.log(' [DEVELOPMENT MODE / NO SMTP CONFIGURED]');
    console.log(` Recipient: ${toEmail}`);
    console.log(` Reset Link: ${resetLink}`);
    console.log('====================================================================\n');
    return { sent: false, devLink: resetLink };
  }
}

module.exports = {
  sendPasswordResetEmail
};

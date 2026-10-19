const nodemailer = require('nodemailer');

// Configure mail transporter
function getTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  return null;
}

// 1. Password Reset Email
async function sendPasswordResetEmail(toEmail, rawToken) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}#reset-password?token=${rawToken}&email=${encodeURIComponent(toEmail)}`;

  const transporter = getTransporter();

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"NMIMS Peer Buddy" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: 'NMIMS Peer Buddy — Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 8px;">
            <h2 style="color: #E4574C; margin-top: 0;">NMIMS Peer Buddy System</h2>
            <p style="font-size: 15px; color: #374151;">Hello,</p>
            <p style="font-size: 15px; color: #374151;">We received a request to reset your password for your NMIMS Peer Buddy account.</p>
            <div style="margin: 28px 0; text-align: center;">
              <a href="${resetLink}" style="background-color: #E4574C; color: #FFFFFF; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #6B7280; font-size: 14px;">This link will expire in 30 minutes and can only be used once.</p>
            <p style="color: #6B7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
            <p style="color: #9CA3AF; font-size: 12px;">Or copy and paste this link in your browser:<br/><a href="${resetLink}" style="color: #E4574C;">${resetLink}</a></p>
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
    console.log('\n====================================================================');
    console.log(' [DEVELOPMENT MODE / NO SMTP CONFIGURED]');
    console.log(` Recipient: ${toEmail}`);
    console.log(` Password Reset Link: ${resetLink}`);
    console.log('====================================================================\n');
    return { sent: false, devLink: resetLink };
  }
}

// 2. Account Registration Confirmation Email
async function sendWelcomeEmail(toEmail, fullName, role) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  const loginLink = `${frontendUrl}#login`;

  const transporter = getTransporter();

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"NMIMS Peer Buddy" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: 'Welcome to NMIMS Peer Buddy System — Account Created Successfully',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 8px;">
            <h2 style="color: #E4574C; margin-top: 0;">Welcome to NMIMS Peer Buddy!</h2>
            <p style="font-size: 15px; color: #374151;">Dear <strong>${fullName}</strong>,</p>
            <p style="font-size: 15px; color: #374151;">Your <strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong> account has been created successfully.</p>
            <p style="font-size: 15px; color: #374151;">You can now log in to discover peer buddies, book study sessions, access learning resources, and connect with mentors across NMIMS.</p>
            <div style="margin: 28px 0; text-align: center;">
              <a href="${loginLink}" style="background-color: #E4574C; color: #FFFFFF; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Go to NMIMS Peer Buddy</a>
            </div>
            <p style="color: #6B7280; font-size: 13px;">Registered Email: <strong>${toEmail}</strong></p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
            <p style="color: #9CA3AF; font-size: 12px;">NMIMS Intra-College Collaboration Platform</p>
          </div>
        `
      });
      console.log(`[Email] Welcome email dispatched via SMTP to ${toEmail}`);
      return { sent: true };
    } catch (err) {
      console.error('[Email] SMTP welcome send failed:', err.message);
      return { sent: false, error: err.message };
    }
  } else {
    console.log(`[Email Dev] Welcome email logged for ${toEmail} (${fullName})`);
    return { sent: false };
  }
}

// 3. Email Verification Link Email
async function sendVerificationEmail(toEmail, rawToken) {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000';
  const verifyLink = `${frontendUrl}#verify-email?token=${rawToken}&email=${encodeURIComponent(toEmail)}`;

  const transporter = getTransporter();

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"NMIMS Peer Buddy" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: 'Verify Your NMIMS Peer Buddy Email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 8px;">
            <h2 style="color: #E4574C; margin-top: 0;">NMIMS Peer Buddy System</h2>
            <p style="font-size: 15px; color: #374151;">Hello,</p>
            <p style="font-size: 15px; color: #374151;">Please confirm your NMIMS email address by clicking the link below:</p>
            <div style="margin: 28px 0; text-align: center;">
              <a href="${verifyLink}" style="background-color: #E4574C; color: #FFFFFF; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">Verify Email</a>
            </div>
            <p style="color: #6B7280; font-size: 14px;">This link is valid for 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
            <p style="color: #9CA3AF; font-size: 12px;">Or copy and paste this link in your browser:<br/><a href="${verifyLink}" style="color: #E4574C;">${verifyLink}</a></p>
          </div>
        `
      });
      console.log(`[Email] Verification email dispatched to ${toEmail}`);
      return { sent: true };
    } catch (err) {
      console.error('[Email] SMTP verification send failed:', err.message);
      return { sent: false, error: err.message };
    }
  } else {
    console.log(`[Email Dev] Verification link for ${toEmail}: ${verifyLink}`);
    return { sent: false, devLink: verifyLink };
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVerificationEmail
};

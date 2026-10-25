const { Resend } = require('resend');
const nodemailer = require('nodemailer');

// 1. Initialize Resend client if RESEND_API_KEY is configured
let resendClient = null;
function getResendClient() {
  if (process.env.RESEND_API_KEY && !resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// 2. Fallback SMTP transporter if SMTP_HOST is configured
let smtpTransporter = null;
function getSmtpTransporter() {
  const host = process.env.SMTP_HOST || (process.env.SMTP_SERVICE === 'outlook' ? 'smtp.office365.com' : null);
  const user = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

  if (host && user && pass) {
    if (!smtpTransporter) {
      const port = parseInt(process.env.SMTP_PORT || '587', 10);
      smtpTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465 || process.env.SMTP_SECURE === 'true',
        auth: {
          user,
          pass
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false
        }
      });
    }
    return smtpTransporter;
  }
  return null;
}

function getSender() {
  if (process.env.EMAIL_FROM) {
    return process.env.EMAIL_FROM;
  }
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  if (smtpUser) {
    return `NMIMS Peer Buddy <${smtpUser}>`;
  }
  if (process.env.RESEND_API_KEY) {
    return 'NMIMS Peer Buddy <onboarding@resend.dev>';
  }
  return 'NMIMS Peer Buddy <no-reply@nmims.in>';
}

function getFrontendUrl() {
  let url = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://peer-buddy-api.onrender.com';
  // Strip any accidental Vercel or localhost references in production
  if (url.includes('vercel.app')) {
    url = 'https://peer-buddy-api.onrender.com';
  }
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  return url;
}

/**
 * Core send helper: Try Resend first, then SMTP fallback, then dev log
 */
async function sendEmail({ to, subject, html, text }) {
  const sender = getSender();
  const resend = getResendClient();

  // Mode A: Resend API
  if (resend) {
    try {
      const response = await resend.emails.send({
        from: sender,
        to: [to],
        subject,
        html,
        text: text || ''
      });

      if (response.error) {
        console.error('[Email Service] Resend error:', response.error.message || response.error);
        return { sent: false, error: response.error.message || 'Resend delivery failed' };
      }

      console.log(`[Email Service] Dispatched via Resend to ${to} (id: ${response.data ? response.data.id : 'ok'})`);
      return { sent: true, provider: 'resend', id: response.data ? response.data.id : null };
    } catch (err) {
      console.error('[Email Service] Resend exception:', err.message);
      return { sent: false, error: err.message };
    }
  }

  // Mode B: SMTP Transporter (Office 365 / Gmail)
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from: sender,
        to,
        subject,
        html,
        text
      });
      console.log(`[Email Service] Dispatched via SMTP to ${to} (id: ${info.messageId})`);
      return { sent: true, provider: 'smtp', id: info.messageId };
    } catch (err) {
      console.error('[Email Service] SMTP exception:', err.message);
      return { sent: false, error: err.message };
    }
  }

  // Mode C: Development Logger (When no keys configured)
  console.log('\n====================================================================');
  console.log(' [EMAIL SERVICE DEV LOG — No RESEND_API_KEY or SMTP configured]');
  console.log(` Recipient : ${to}`);
  console.log(` Subject   : ${subject}`);
  console.log('====================================================================\n');
  return { sent: false, error: 'No email provider configured (set RESEND_API_KEY or SMTP_HOST)' };
}

/**
 * 1. Send Password Reset Email
 */
async function sendPasswordResetEmail(toEmail, rawToken) {
  const frontendUrl = getFrontendUrl();
  const resetLink = `${frontendUrl}#reset-password?token=${rawToken}&email=${encodeURIComponent(toEmail)}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 28px; border: 1px solid #E5E7EB; border-radius: 10px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <h2 style="color: #E4574C; margin: 0; font-size: 22px; font-weight: 700;">NMIMS Peer Buddy System</h2>
        <span style="font-size: 13px; color: #6B7280;">Secure Password Reset</span>
      </div>
      
      <p style="font-size: 15px; color: #1F2937; line-height: 1.5;">Hello,</p>
      <p style="font-size: 15px; color: #374151; line-height: 1.5;">We received a request to reset the password for your account associated with <strong>${toEmail}</strong>.</p>
      
      <div style="margin: 32px 0; text-align: center;">
        <a href="${resetLink}" style="background-color: #E4574C; color: #FFFFFF; padding: 13px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 2px 4px rgba(228,87,76,0.2);">Reset Your Password</a>
      </div>

      <p style="color: #4B5563; font-size: 14px; line-height: 1.5;">
        • This link will expire in <strong>30 minutes</strong>.<br/>
        • This link is single-use and will be invalidated after resetting.
      </p>

      <p style="color: #6B7280; font-size: 13px; margin-top: 24px;">If you did not request a password reset, you can safely ignore this email; your account remains secure.</p>
      
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      
      <p style="color: #9CA3AF; font-size: 12px; line-height: 1.4;">
        If the button above does not work, copy and paste this link into your browser:<br/>
        <a href="${resetLink}" style="color: #E4574C; word-break: break-all;">${resetLink}</a>
      </p>
    </div>
  `;

  return sendEmail({
    to: toEmail,
    subject: 'NMIMS Peer Buddy — Password Reset Link',
    html,
    text: `Reset your NMIMS Peer Buddy password: ${resetLink} (Link valid for 30 minutes)`
  });
}

/**
 * 2. Send Registration / Welcome Email
 */
async function sendWelcomeEmail(toEmail, fullName, role) {
  const frontendUrl = getFrontendUrl();
  const loginLink = `${frontendUrl}#login`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 28px; border: 1px solid #E5E7EB; border-radius: 10px; background-color: #ffffff;">
      <div style="margin-bottom: 24px;">
        <h2 style="color: #E4574C; margin: 0; font-size: 22px; font-weight: 700;">Welcome to NMIMS Peer Buddy!</h2>
        <span style="font-size: 13px; color: #6B7280;">Student Peer Collaboration & Mentorship</span>
      </div>

      <p style="font-size: 15px; color: #1F2937; line-height: 1.5;">Dear <strong>${fullName}</strong>,</p>
      <p style="font-size: 15px; color: #374151; line-height: 1.5;">Your <strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong> account has been created successfully.</p>
      
      <p style="font-size: 14px; color: #4B5563; line-height: 1.6;">
        You can now sign in to:
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li>Search and connect with peer study buddies by school, program, and skills</li>
          <li>Schedule and manage interactive study sessions</li>
          <li>Access curated academic resources and faculty announcements</li>
          <li>Connect with designated mentors for guidance</li>
        </ul>
      </p>

      <div style="margin: 30px 0; text-align: center;">
        <a href="${loginLink}" style="background-color: #E4574C; color: #FFFFFF; padding: 13px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">Log In to Peer Buddy</a>
      </div>

      <p style="color: #6B7280; font-size: 13px;">Registered Email ID: <strong>${toEmail}</strong></p>
      
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #9CA3AF; font-size: 12px; margin: 0;">NMIMS Intra-College Collaboration Platform</p>
    </div>
  `;

  return sendEmail({
    to: toEmail,
    subject: 'Welcome to NMIMS Peer Buddy System — Account Registered',
    html,
    text: `Welcome to NMIMS Peer Buddy, ${fullName}! Your ${role} account has been created. Log in at ${loginLink}`
  });
}

/**
 * 3. Send Email Verification Link
 */
async function sendVerificationEmail(toEmail, rawToken) {
  const frontendUrl = getFrontendUrl();
  const verifyLink = `${frontendUrl}#verify-email?token=${rawToken}&email=${encodeURIComponent(toEmail)}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 28px; border: 1px solid #E5E7EB; border-radius: 10px; background-color: #ffffff;">
      <h2 style="color: #E4574C; margin-top: 0; font-size: 22px;">NMIMS Peer Buddy System</h2>
      <p style="font-size: 15px; color: #374151;">Hello,</p>
      <p style="font-size: 15px; color: #374151;">Please confirm your NMIMS email address by clicking the button below:</p>
      
      <div style="margin: 28px 0; text-align: center;">
        <a href="${verifyLink}" style="background-color: #E4574C; color: #FFFFFF; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; display: inline-block;">Verify Email Address</a>
      </div>
      
      <p style="color: #6B7280; font-size: 14px;">This link will expire in 24 hours.</p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
      <p style="color: #9CA3AF; font-size: 12px;">Link: <a href="${verifyLink}" style="color: #E4574C;">${verifyLink}</a></p>
    </div>
  `;

  return sendEmail({
    to: toEmail,
    subject: 'Verify Your NMIMS Peer Buddy Email',
    html,
    text: `Verify your NMIMS Peer Buddy email: ${verifyLink}`
  });
}

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVerificationEmail
};

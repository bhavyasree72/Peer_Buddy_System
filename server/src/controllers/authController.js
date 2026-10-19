const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../database/db');
const { generateTokens } = require('../middleware/auth');

// Validation rules from NMIMS doc:
// - NMIMS email domain only (@nmims.in or @*nmims.edu)
// - Unique SAP ID & email
// - Min 8 characters, at least one letter and one number
// - 5 wrong attempts lock the account for 15 minutes

function isValidNMIMSEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.trim().toLowerCase();
  return lower.endsWith('@nmims.in') || lower.endsWith('@nmims.edu') || /@[\w.-]*nmims\.edu$/i.test(lower);
}

function isValidPassword(password) {
  if (!password || password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

// Helper: SHA-256 hash a plaintext token before storing in database
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// POST /api/auth/register
// CHANGE 4: Public registration creates only the permitted default role ('student').
// Never trust a role supplied by public frontend.
async function register(req, res) {
  try {
    const {
      fullName,
      sapId,
      email,
      password,
      schoolId,
      programId,
      semester,
      year,
      mentorId
    } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, NMIMS email, and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidNMIMSEmail(trimmedEmail)) {
      return res.status(400).json({ error: 'Registration is permitted only with an official NMIMS email (e.g. name@nmims.in).' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain at least one letter and one number.' });
    }

    // Role enforcement: Public registration always defaults to 'student'.
    // Mentor, Faculty, and Admin roles must be provisioned by an authorized administrator.
    const assignedRole = 'student';

    // Check unique email
    const existingEmail = await query('SELECT user_id FROM users WHERE email = ?', [trimmedEmail]);
    if (existingEmail.rowCount > 0) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    // Check unique SAP ID if provided
    if (sapId) {
      const existingSap = await query('SELECT user_id FROM users WHERE sap_id = ?', [sapId.trim()]);
      if (existingSap.rowCount > 0) {
        return res.status(400).json({ error: 'This SAP ID is already registered.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    // Generate secure random verification token & store only its SHA-256 hash
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = hashToken(rawVerificationToken);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await withTransaction(async (txQuery) => {
      // Create user
      await txQuery(
        `INSERT INTO users (user_id, sap_id, email, password_hash, role, status, email_verified)
         VALUES (?, ?, ?, ?, ?, 'active', 1)`,
        [userId, sapId ? sapId.trim() : null, trimmedEmail, passwordHash, assignedRole]
      );

      // Student profile
      await txQuery(
        `INSERT INTO student_profiles (user_id, full_name, school_id, program_id, semester, year, mentor_id, profile_completeness)
         VALUES (?, ?, ?, ?, ?, ?, ?, 40)`,
        [userId, fullName.trim(), schoolId || null, programId || null, semester || 1, year || 1, mentorId || null]
      );

      // Auto-connect to mentor if selected
      if (mentorId) {
        const connectionId = uuidv4();
        await txQuery(
          `INSERT INTO connections (connection_id, user_a, user_b, status) VALUES (?, ?, ?, 'active')`,
          [connectionId, userId, mentorId]
        );
      }

      // Store hashed verification token
      await txQuery(
        `INSERT INTO email_verifications (token, email, expires_at) VALUES (?, ?, ?)`,
        [verificationTokenHash, trimmedEmail, verificationExpiresAt]
      );

      // Audit log
      await txQuery(
        `INSERT INTO audit_log (log_id, actor_id, action, target, details) VALUES (?, ?, 'USER_REGISTERED', ?, ?)`,
        [uuidv4(), userId, trimmedEmail, `Student registered: ${fullName.trim()} (${trimmedEmail})`]
      );
    });

    // Send confirmation welcome email asynchronously
    const { sendWelcomeEmail } = require('../utils/emailService');
    await sendWelcomeEmail(trimmedEmail, fullName.trim(), assignedRole).catch(e => console.error(e));

    return res.status(201).json({
      message: 'Account created successfully.',
      userId,
      role: assignedRole
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'An error occurred during registration. Please try again.' });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const userRes = await query('SELECT * FROM users WHERE email = ?', [trimmedEmail]);

    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: 'That email and password do not match. Please try again or reset your password.' });
    }

    const user = userRes.rows[0];

    // Check account status
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });
    }
    if (user.status === 'deleted') {
      return res.status(403).json({ error: 'This account is no longer active.' });
    }

    // Check lockout
    if (user.lockout_until) {
      const lockoutDate = new Date(user.lockout_until);
      if (lockoutDate > new Date()) {
        const remainingMinutes = Math.ceil((lockoutDate - new Date()) / (60 * 1000));
        return res.status(429).json({
          error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minute(s).`
        });
      } else {
        // Lockout expired, reset failed attempts
        await query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE user_id = ?', [user.user_id]);
        user.failed_login_attempts = 0;
      }
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const attempts = (user.failed_login_attempts || 0) + 1;

      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await query('UPDATE users SET failed_login_attempts = ?, lockout_until = ? WHERE user_id = ?', [
          attempts,
          lockUntil,
          user.user_id
        ]);
        return res.status(429).json({
          error: 'Account locked for 15 minutes due to 5 consecutive failed attempts. Please reset your password or try later.'
        });
      }

      await query('UPDATE users SET failed_login_attempts = ? WHERE user_id = ?', [attempts, user.user_id]);
      return res.status(401).json({
        error: 'That email and password do not match. Please try again or reset your password.'
      });
    }

    // Reset failed login attempts and update last_login
    await query(
      "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, last_login = CURRENT_TIMESTAMP WHERE user_id = ?",
      [user.user_id]
    );

    // Get user profile details
    let profile = null;
    if (user.role === 'student') {
      const profRes = await query('SELECT * FROM student_profiles WHERE user_id = ?', [user.user_id]);
      profile = profRes.rows[0] || {};
    } else {
      const profRes = await query('SELECT * FROM staff_profiles WHERE user_id = ?', [user.user_id]);
      profile = profRes.rows[0] || {};
    }

    const tokens = generateTokens(user);

    return res.json({
      message: 'Login successful',
      user: {
        userId: user.user_id,
        email: user.email,
        sapId: user.sap_id,
        role: user.role,
        fullName: profile.full_name || user.email.split('@')[0],
        photoUrl: profile.photo_url || null,
        semester: profile.semester,
        profileCompleteness: profile.profile_completeness || 0
      },
      ...tokens
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
}

// POST /api/auth/forgot-password
// CHANGE 1: Fix password-reset token exposure
// - Return generic success message regardless of whether email exists (prevent account enumeration).
// - NEVER return reset token or log it.
// - Cryptographically secure token generated with crypto.randomBytes(32).
// - Store only SHA-256 hash of token in database.
// - Short expiry: 15-30 minutes.
// - Single-use token.
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const userRes = await query('SELECT user_id FROM users WHERE email = ?', [trimmedEmail]);

    if (userRes.rowCount > 0) {
      // Cryptographically secure random token (32 bytes = 64 hex chars)
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

      // Invalidate existing outstanding reset tokens for this email
      await query('DELETE FROM password_resets WHERE email = ?', [trimmedEmail]);

      // Store only the token hash
      await query('INSERT INTO password_resets (token, email, expires_at) VALUES (?, ?, ?)', [
        tokenHash,
        trimmedEmail,
        expiresAt
      ]);

      // Dispatch reset email asynchronously
      const { sendPasswordResetEmail } = require('../utils/emailService');
      await sendPasswordResetEmail(trimmedEmail, rawToken);
    }

    // Always return generic success message to prevent account enumeration
    return res.json({
      message: 'If an account associated with this email exists, a password reset link has been dispatched.'
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Could not process password reset request.' });
  }
}

// POST /api/auth/reset-password
// CHANGE 1:
// - Validate token hash from database
// - Single-use: immediately delete token upon successful reset
// - Update password securely using strong bcrypt hash
// - Reset lockout counters
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain at least one letter and one number.' });
    }

    const tokenHash = hashToken(token.trim());

    // Atomic transaction: Find, validate, consume token, and update password
    const resetSuccess = await withTransaction(async (txQuery) => {
      const resetRes = await txQuery('SELECT * FROM password_resets WHERE token = ?', [tokenHash]);
      if (resetRes.rowCount === 0) {
        return { error: 'Invalid or expired password reset link.', status: 400 };
      }

      const resetRecord = resetRes.rows[0];
      if (new Date(resetRecord.expires_at) < new Date()) {
        // Cleanup expired token
        await txQuery('DELETE FROM password_resets WHERE token = ?', [tokenHash]);
        return { error: 'This password reset link has expired.', status: 400 };
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await txQuery(
        'UPDATE users SET password_hash = ?, failed_login_attempts = 0, lockout_until = NULL WHERE email = ?',
        [newHash, resetRecord.email]
      );

      // Invalidate all tokens for this email to prevent reuse or replay
      await txQuery('DELETE FROM password_resets WHERE email = ?', [resetRecord.email]);

      return { success: true };
    });

    if (resetSuccess.error) {
      return res.status(resetSuccess.status || 400).json({ error: resetSuccess.error });
    }

    return res.json({ message: 'Your password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Could not reset password.' });
  }
}

// POST /api/auth/verify-email
// CHANGE 4: Token-based email verification endpoint
async function verifyEmail(req, res) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    const tokenHash = hashToken(token.trim());

    const result = await withTransaction(async (txQuery) => {
      const verifyRes = await txQuery('SELECT * FROM email_verifications WHERE token = ?', [tokenHash]);
      if (verifyRes.rowCount === 0) {
        return { error: 'Invalid or expired verification token.', status: 400 };
      }

      const record = verifyRes.rows[0];
      if (new Date(record.expires_at) < new Date()) {
        await txQuery('DELETE FROM email_verifications WHERE token = ?', [tokenHash]);
        return { error: 'This verification token has expired.', status: 400 };
      }

      // Mark user as verified
      await txQuery('UPDATE users SET email_verified = 1 WHERE email = ?', [record.email]);
      // Invalidate token
      await txQuery('DELETE FROM email_verifications WHERE token = ?', [tokenHash]);

      return { success: true, email: record.email };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json({ message: 'Email verified successfully. You can now access all features.' });
  } catch (err) {
    console.error('verifyEmail error:', err);
    return res.status(500).json({ error: 'Failed to verify email.' });
  }
}

// POST /api/auth/resend-verification
async function resendVerification(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const userRes = await query('SELECT user_id, email_verified FROM users WHERE email = ?', [trimmedEmail]);

    if (userRes.rowCount > 0 && userRes.rows[0].email_verified === 0) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await query('DELETE FROM email_verifications WHERE email = ?', [trimmedEmail]);
      await query('INSERT INTO email_verifications (token, email, expires_at) VALUES (?, ?, ?)', [
        tokenHash,
        trimmedEmail,
        expiresAt
      ]);

      const { sendVerificationEmail } = require('../utils/emailService');
      await sendVerificationEmail(trimmedEmail, rawToken).catch(e => console.error(e));
    }

    // Generic response to avoid enumeration
    return res.json({
      message: 'If the account exists and requires verification, a link has been dispatched.'
    });
  } catch (err) {
    console.error('resendVerification error:', err);
    return res.status(500).json({ error: 'Could not process request.' });
  }
}

// GET /api/auth/me
async function getMe(req, res) {
  try {
    const userId = req.user.userId;
    const userRes = await query('SELECT user_id, sap_id, email, role, status, email_verified, created_at, last_login FROM users WHERE user_id = ?', [userId]);
    
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];
    let profile = null;

    if (user.role === 'student') {
      const profRes = await query(`
        SELECT sp.*, s.name as school_name, p.name as program_name 
        FROM student_profiles sp
        LEFT JOIN schools s ON sp.school_id = s.id
        LEFT JOIN programs p ON sp.program_id = p.id
        WHERE sp.user_id = ?
      `, [userId]);
      profile = profRes.rows[0] || {};
    } else {
      const profRes = await query('SELECT * FROM staff_profiles WHERE user_id = ?', [userId]);
      profile = profRes.rows[0] || {};
    }

    return res.json({
      user,
      profile
    });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ error: 'Failed to retrieve user profile.' });
  }
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  getMe,
  hashToken
};

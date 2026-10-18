const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');
const { generateTokens } = require('../middleware/auth');

// Validation rules from doc:
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

// POST /api/auth/register
async function register(req, res) {
  try {
    const {
      fullName,
      sapId,
      email,
      password,
      role = 'student',
      schoolId,
      programId,
      semester,
      year,
      mentorId,
      department,
      designation
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

    // Role validation
    const allowedRoles = ['student', 'mentor', 'faculty'];
    const chosenRole = allowedRoles.includes(role) ? role : 'student';

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
    const verificationToken = uuidv4();

    // Create user with active status & auto-verified in dev/pilot mode or pending with verification link
    await query(
      `INSERT INTO users (user_id, sap_id, email, password_hash, role, status, email_verified)
       VALUES (?, ?, ?, ?, ?, 'active', 1)`,
      [userId, sapId ? sapId.trim() : null, trimmedEmail, passwordHash, chosenRole]
    );

    if (chosenRole === 'student') {
      await query(
        `INSERT INTO student_profiles (user_id, full_name, school_id, program_id, semester, year, mentor_id, profile_completeness)
         VALUES (?, ?, ?, ?, ?, ?, ?, 40)`,
        [userId, fullName.trim(), schoolId || null, programId || null, semester || 1, year || 1, mentorId || null]
      );

      // If a mentor was selected, automatically establish a connection between student and mentor
      if (mentorId) {
        const connectionId = uuidv4();
        await query(
          `INSERT INTO connections (connection_id, user_a, user_b, status) VALUES (?, ?, ?, 'active')`,
          [connectionId, userId, mentorId]
        );
      }
    } else {
      // Mentor or Faculty
      await query(
        `INSERT INTO staff_profiles (user_id, full_name, department, designation, expertise)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          fullName.trim(),
          department ? department.trim() : (chosenRole === 'mentor' ? 'Academic Mentorship' : 'Academic Faculty'),
          designation ? designation.trim() : (chosenRole === 'mentor' ? 'Mentor' : 'Faculty Member'),
          `${chosenRole.charAt(0).toUpperCase() + chosenRole.slice(1)} at NMIMS`
        ]
      );
    }

    // Store verification token
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await query(`INSERT INTO email_verifications (token, email, expires_at) VALUES (?, ?, ?)`, [
      verificationToken,
      trimmedEmail,
      expiresAt
    ]);

    // Audit log
    await query(`INSERT INTO audit_log (log_id, actor_id, action, target, details) VALUES (?, ?, 'USER_REGISTERED', ?, ?)`, [
      uuidv4(),
      userId,
      trimmedEmail,
      `${chosenRole.charAt(0).toUpperCase() + chosenRole.slice(1)} registered: ${fullName.trim()} (${trimmedEmail})`
    ]);

    return res.status(201).json({
      message: 'Account created successfully.',
      verificationToken,
      userId,
      role: chosenRole
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
      let lockoutSql = '';
      const params = [attempts];

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
      "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, last_login = datetime('now') WHERE user_id = ?",
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
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const userRes = await query('SELECT user_id FROM users WHERE email = ?', [trimmedEmail]);
    
    // Always return polite message to avoid email enumeration
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins as per doc

    if (userRes.rowCount > 0) {
      await query('INSERT INTO password_resets (token, email, expires_at) VALUES (?, ?, ?)', [
        resetToken,
        trimmedEmail,
        expiresAt
      ]);
    }

    return res.json({
      message: `If an account with ${trimmedEmail} exists, a password reset link has been issued (valid 30 minutes).`,
      resetToken // provided for testing
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Could not process password reset request.' });
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long and contain at least one letter and one number.' });
    }

    const resetRes = await query('SELECT * FROM password_resets WHERE token = ?', [token]);
    if (resetRes.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired password reset link.' });
    }

    const resetRecord = resetRes.rows[0];
    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This password reset link has expired.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = ?, failed_login_attempts = 0, lockout_until = NULL WHERE email = ?', [
      newHash,
      resetRecord.email
    ]);

    await query('DELETE FROM password_resets WHERE token = ?', [token]);

    return res.json({ message: 'Your password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Could not reset password.' });
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
  getMe
};

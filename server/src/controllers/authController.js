const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { COLLECTIONS, getDoc, setDoc, updateDoc, deleteWhere, queryDocs, runTransaction, nowISO, collection, getFirestore } = require('../database/firestoreDb');
const { generateTokens } = require('../middleware/auth');

// Validation rules:
// - All roles: must end with @gmail.com
// - SAP ID (students): exactly 11 digits, numeric only, starts with 7
// - Name: letters and spaces only, min 2 chars
// - Password: min 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character

function isValidRoleEmail(email, role) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.trim().toLowerCase();
  if (lower.endsWith('@nmims.in') || lower.endsWith('@nmims.edu')) return false;
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(lower);
}

function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 2 && /^[a-zA-Z\s]+$/.test(trimmed);
}

function isValidSapId(sapId) {
  if (!sapId || typeof sapId !== 'string') return false;
  return /^7\d{10}$/.test(sapId.trim());
}

function isValidStrongPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]).{8,}$/.test(password);
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const {
      role = 'student', fullName, sapId, email, password,
      schoolId, programId, semester, year, mentorId,
      department, designation
    } = req.body;

    const requestedRole = ['student', 'faculty', 'mentor'].includes(role) ? role : 'student';

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, Gmail address, and password are required.' });
    }
    if (!isValidName(fullName)) {
      return res.status(400).json({ error: 'Name must contain letters and spaces only (minimum 2 characters).' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidRoleEmail(trimmedEmail, requestedRole)) {
      return res.status(400).json({ error: 'Please enter a valid Gmail address ending with @gmail.com.' });
    }
    if (!isValidStrongPassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'
      });
    }

    if (requestedRole === 'student') {
      if (!sapId) return res.status(400).json({ error: 'SAP ID is required for student registration.' });
      if (!isValidSapId(sapId)) return res.status(400).json({ error: 'SAP ID must be exactly 11 digits, numeric only, and start with 7 (e.g. 70572400072).' });
      if (!semester) return res.status(400).json({ error: 'Please select a valid semester.' });
      if (!schoolId) return res.status(400).json({ error: 'Please select a valid school.' });
      
      // Validate school
      const schoolDoc = await getDoc(COLLECTIONS.SCHOOLS, schoolId);
      if (!schoolDoc || !['SOL', 'STME', 'SPTM', 'SOC', 'SBM'].includes((schoolDoc.code || '').toUpperCase())) {
        return res.status(400).json({ error: 'Selected school is not valid. Permitted schools: SOL, STME, SPTM, SOC, SBM.' });
      }
      if (!programId) return res.status(400).json({ error: 'Please select a valid program.' });
    } else {
      if (!department || !department.trim()) return res.status(400).json({ error: 'Department is required.' });
      if (!designation || !designation.trim()) return res.status(400).json({ error: 'Designation is required.' });
    }

    // Check unique email
    const existingEmail = await queryDocs(COLLECTIONS.USERS, [['email', '==', trimmedEmail]], null, 'asc', 1);
    if (existingEmail.length > 0) {
      return res.status(400).json({ error: 'An account with this email address already exists.' });
    }

    // Check unique SAP ID for students
    if (requestedRole === 'student' && sapId) {
      const existingSap = await queryDocs(COLLECTIONS.USERS, [['sap_id', '==', sapId.trim()]], null, 'asc', 1);
      if (existingSap.length > 0) {
        return res.status(400).json({ error: 'This SAP ID is already registered.' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const now = nowISO();

    // Generate verification token
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = hashToken(rawVerificationToken);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Create user document
    await setDoc(COLLECTIONS.USERS, userId, {
      user_id: userId,
      sap_id: requestedRole === 'student' ? sapId.trim() : null,
      email: trimmedEmail,
      password_hash: passwordHash,
      role: requestedRole,
      status: 'active',
      email_verified: 1,
      failed_login_attempts: 0,
      lockout_until: null,
      created_at: now,
      last_login: null
    });

    if (requestedRole === 'student') {
      await setDoc(COLLECTIONS.STUDENT_PROFILES, userId, {
        user_id: userId,
        full_name: fullName.trim(),
        school_id: schoolId || null,
        program_id: programId || null,
        semester: semester || 1,
        year: year || 1,
        mentor_id: mentorId || null,
        bio: null,
        photo_url: null,
        study_mode: 'both',
        open_to_requests: 1,
        show_email: 0,
        show_availability: 1,
        profile_completeness: 40,
        created_at: now
      });
    } else {
      await setDoc(COLLECTIONS.STAFF_PROFILES, userId, {
        user_id: userId,
        full_name: fullName.trim(),
        department: department.trim(),
        designation: designation.trim(),
        expertise: null,
        photo_url: null
      });
    }

    // Store hashed verification token
    await setDoc(COLLECTIONS.EMAIL_VERIFICATIONS, verificationTokenHash, {
      token: verificationTokenHash,
      email: trimmedEmail,
      expires_at: verificationExpiresAt
    });

    // Audit log
    await setDoc(COLLECTIONS.AUDIT_LOG, uuidv4(), {
      log_id: uuidv4(),
      actor_id: userId,
      action: 'USER_REGISTERED',
      target: trimmedEmail,
      details: `${requestedRole} registered: ${fullName.trim()} (${trimmedEmail})`,
      created_at: now
    });

    // Also create Firebase Auth user for client-side auth flows
    try {
      const { getAuth } = require('../utils/firebaseAdmin');
      const fbAuth = getAuth();
      await fbAuth.createUser({
        uid: userId,
        email: trimmedEmail,
        password: password,
        displayName: fullName.trim(),
        emailVerified: true
      }).catch(err => {
        if (err.code !== 'auth/email-already-exists') {
          console.log('Firebase Auth create note:', err.message);
        }
      });
      // Set custom claims for role
      await fbAuth.setCustomUserClaims(userId, { role: requestedRole }).catch(() => {});
    } catch (e) {
      console.log('Firebase Auth sync (non-blocking):', e.message);
    }

    // Send welcome email
    let emailDelivery = { sent: false };
    try {
      const { sendWelcomeEmail } = require('../utils/emailService');
      emailDelivery = await sendWelcomeEmail(trimmedEmail, fullName.trim(), requestedRole);
    } catch (e) {
      console.error('[Registration] Welcome email failed:', e.message);
    }

    return res.status(201).json({
      message: 'Account created successfully.',
      userId,
      role: requestedRole,
      emailSent: !!emailDelivery.sent,
      emailProvider: emailDelivery.provider || null
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: err.message || 'An error occurred during registration. Please try again.' });
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
    const users = await queryDocs(COLLECTIONS.USERS, [['email', '==', trimmedEmail]], null, 'asc', 1);

    if (users.length === 0) {
      return res.status(401).json({ error: 'That email and password do not match. Please try again or reset your password.' });
    }

    const user = users[0];

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
        await updateDoc(COLLECTIONS.USERS, user.user_id, { failed_login_attempts: 0, lockout_until: null });
        user.failed_login_attempts = 0;
      }
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const attempts = (user.failed_login_attempts || 0) + 1;

      if (attempts >= 5) {
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await updateDoc(COLLECTIONS.USERS, user.user_id, { failed_login_attempts: attempts, lockout_until: lockUntil });
        return res.status(429).json({
          error: 'Account locked for 15 minutes due to 5 consecutive failed attempts. Please reset your password or try later.'
        });
      }

      await updateDoc(COLLECTIONS.USERS, user.user_id, { failed_login_attempts: attempts });
      return res.status(401).json({
        error: 'That email and password do not match. Please try again or reset your password.'
      });
    }

    // Check email verification status: block unverified student, faculty, and mentor
    if (!user.email_verified && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Email verification required. Please check your Gmail inbox and click the verification link before logging in.',
        unverified: true,
        email: user.email
      });
    }

    // Reset failed attempts and update last_login
    await updateDoc(COLLECTIONS.USERS, user.user_id, {
      failed_login_attempts: 0,
      lockout_until: null,
      last_login: nowISO()
    });

    // Get profile
    let profile = null;
    if (user.role === 'student') {
      profile = await getDoc(COLLECTIONS.STUDENT_PROFILES, user.user_id) || {};
    } else {
      profile = await getDoc(COLLECTIONS.STAFF_PROFILES, user.user_id) || {};
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
    const users = await queryDocs(COLLECTIONS.USERS, [['email', '==', trimmedEmail]], null, 'asc', 1);

    if (users.length > 0) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // Invalidate existing reset tokens
      await deleteWhere(COLLECTIONS.PASSWORD_RESETS, 'email', '==', trimmedEmail);

      // Store hashed token
      await setDoc(COLLECTIONS.PASSWORD_RESETS, tokenHash, {
        token: tokenHash,
        email: trimmedEmail,
        expires_at: expiresAt
      });

      // Send reset email
      const { sendPasswordResetEmail } = require('../utils/emailService');
      const emailRes = await sendPasswordResetEmail(trimmedEmail, rawToken);
      if (!emailRes.sent) {
        console.warn(`[Forgot Password] Reset link created for ${trimmedEmail}, but email sending returned: ${emailRes.error}`);
      }
    }

    return res.json({
      message: 'If an account associated with this email exists, a password reset link has been dispatched.'
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

    if (!isValidStrongPassword(newPassword)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'
      });
    }

    const tokenHash = hashToken(token.trim());
    const resetDoc = await getDoc(COLLECTIONS.PASSWORD_RESETS, tokenHash);

    if (!resetDoc) {
      return res.status(400).json({ error: 'Invalid or expired password reset link.' });
    }

    if (new Date(resetDoc.expires_at) < new Date()) {
      await require('../database/firestoreDb').deleteDoc(COLLECTIONS.PASSWORD_RESETS, tokenHash);
      return res.status(400).json({ error: 'This password reset link has expired.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    
    // Find user by email and update password
    const users = await queryDocs(COLLECTIONS.USERS, [['email', '==', resetDoc.email]], null, 'asc', 1);
    if (users.length > 0) {
      await updateDoc(COLLECTIONS.USERS, users[0].user_id, {
        password_hash: newHash,
        failed_login_attempts: 0,
        lockout_until: null
      });

      // Update Firebase Auth password too
      try {
        const { getAuth } = require('../utils/firebaseAdmin');
        await getAuth().updateUser(users[0].user_id, { password: newPassword }).catch(() => {});
      } catch (e) {}
    }

    // Invalidate all tokens for this email
    await deleteWhere(COLLECTIONS.PASSWORD_RESETS, 'email', '==', resetDoc.email);

    return res.json({ message: 'Your password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Could not reset password.' });
  }
}

// POST /api/auth/verify-email
async function verifyEmail(req, res) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    const tokenHash = hashToken(token.trim());
    const verifyDoc = await getDoc(COLLECTIONS.EMAIL_VERIFICATIONS, tokenHash);

    if (!verifyDoc) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }

    if (new Date(verifyDoc.expires_at) < new Date()) {
      await require('../database/firestoreDb').deleteDoc(COLLECTIONS.EMAIL_VERIFICATIONS, tokenHash);
      return res.status(400).json({ error: 'This verification token has expired.' });
    }

    // Mark user as verified
    const users = await queryDocs(COLLECTIONS.USERS, [['email', '==', verifyDoc.email]], null, 'asc', 1);
    if (users.length > 0) {
      await updateDoc(COLLECTIONS.USERS, users[0].user_id, { email_verified: 1 });
    }

    // Invalidate token
    await require('../database/firestoreDb').deleteDoc(COLLECTIONS.EMAIL_VERIFICATIONS, tokenHash);

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
    const users = await queryDocs(COLLECTIONS.USERS, [['email', '==', trimmedEmail]], null, 'asc', 1);

    if (users.length > 0 && users[0].email_verified === 0) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await deleteWhere(COLLECTIONS.EMAIL_VERIFICATIONS, 'email', '==', trimmedEmail);
      await setDoc(COLLECTIONS.EMAIL_VERIFICATIONS, tokenHash, {
        token: tokenHash,
        email: trimmedEmail,
        expires_at: expiresAt
      });

      const { sendVerificationEmail } = require('../utils/emailService');
      await sendVerificationEmail(trimmedEmail, rawToken).catch(e => console.error(e));
    }

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
    const user = await getDoc(COLLECTIONS.USERS, userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Remove sensitive fields
    const safeUser = {
      user_id: user.user_id,
      sap_id: user.sap_id,
      email: user.email,
      role: user.role,
      status: user.status,
      email_verified: user.email_verified,
      created_at: user.created_at,
      last_login: user.last_login
    };

    let profile = null;
    if (user.role === 'student') {
      const profDoc = await getDoc(COLLECTIONS.STUDENT_PROFILES, userId);
      if (profDoc) {
        // Enrich with school and program names
        let schoolName = null, programName = null;
        if (profDoc.school_id) {
          const school = await getDoc(COLLECTIONS.SCHOOLS, profDoc.school_id);
          schoolName = school ? school.name : null;
        }
        if (profDoc.program_id) {
          const program = await getDoc(COLLECTIONS.PROGRAMS, profDoc.program_id);
          programName = program ? program.name : null;
        }
        profile = { ...profDoc, school_name: schoolName, program_name: programName };
      } else {
        profile = {};
      }
    } else {
      profile = await getDoc(COLLECTIONS.STAFF_PROFILES, userId) || {};
    }

    return res.json({ user: safeUser, profile });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ error: 'Failed to retrieve user profile.' });
  }
}

// POST /api/auth/sync-profile
async function syncProfile(req, res) {
  try {
    const {
      uid, role = 'student', fullName, sapId, email,
      schoolId, programId, semester, year, mentorId,
      department, designation, emailVerified = false
    } = req.body;

    if (!uid || !email || !fullName) {
      return res.status(400).json({ error: 'UID, email, and full name are required.' });
    }

    const requestedRole = ['student', 'faculty', 'mentor'].includes(role) ? role : 'student';
    const trimmedEmail = email.trim().toLowerCase();
    const now = nowISO();

    // Check if user document already exists
    let existingUser = await getDoc(COLLECTIONS.USERS, uid);
    if (!existingUser) {
      // Also check by email to link legacy accounts
      const byEmail = await queryDocs(COLLECTIONS.USERS, [['email', '==', trimmedEmail]], null, 'asc', 1);
      if (byEmail.length > 0) {
        existingUser = byEmail[0];
      }
    }

    if (!existingUser) {
      // Create user document in Firestore without storing password
      await setDoc(COLLECTIONS.USERS, uid, {
        user_id: uid,
        sap_id: requestedRole === 'student' ? (sapId ? sapId.trim() : null) : null,
        email: trimmedEmail,
        role: requestedRole,
        status: 'active',
        email_verified: emailVerified ? 1 : 0,
        failed_login_attempts: 0,
        lockout_until: null,
        created_at: now,
        last_login: null
      });

      if (requestedRole === 'student') {
        await setDoc(COLLECTIONS.STUDENT_PROFILES, uid, {
          user_id: uid,
          full_name: fullName.trim(),
          school_id: schoolId || null,
          program_id: programId || null,
          semester: semester ? parseInt(semester, 10) : 1,
          year: year ? parseInt(year, 10) : 1,
          mentor_id: mentorId || null,
          bio: null,
          photo_url: null,
          study_mode: 'both',
          open_to_requests: 1,
          show_email: 0,
          show_availability: 1,
          profile_completeness: 40,
          created_at: now
        });
      } else {
        await setDoc(COLLECTIONS.STAFF_PROFILES, uid, {
          user_id: uid,
          full_name: fullName.trim(),
          department: (department || '').trim(),
          designation: (designation || '').trim(),
          expertise: null,
          photo_url: null
        });
      }

      await setDoc(COLLECTIONS.AUDIT_LOG, uuidv4(), {
        log_id: uuidv4(),
        actor_id: uid,
        action: 'USER_REGISTERED_FIREBASE',
        target: trimmedEmail,
        details: `${requestedRole} registered via Firebase Auth: ${fullName.trim()} (${trimmedEmail})`,
        created_at: now
      });
    } else {
      if (emailVerified && !existingUser.email_verified) {
        await updateDoc(COLLECTIONS.USERS, existingUser.user_id, { email_verified: 1 });
      }
    }

    return res.status(200).json({ message: 'Profile synced successfully', userId: uid, role: requestedRole });
  } catch (err) {
    console.error('syncProfile error:', err);
    return res.status(500).json({ error: 'Failed to synchronize profile.' });
  }
}

// POST /api/auth/firebase-login
async function firebaseLogin(req, res) {
  try {
    const { idToken, email } = req.body;
    let decodedUid = null;
    let decodedEmail = email ? email.trim().toLowerCase() : null;
    let isVerified = false;

    if (idToken) {
      try {
        const { getAuth } = require('../utils/firebaseAdmin');
        const decoded = await getAuth().verifyIdToken(idToken);
        decodedUid = decoded.uid;
        decodedEmail = decoded.email ? decoded.email.toLowerCase() : decodedEmail;
        isVerified = !!decoded.email_verified;
      } catch (e) {
        try {
          const base64Url = idToken.split('.')[1];
          if (base64Url) {
            const payload = JSON.parse(Buffer.from(base64Url, 'base64').toString());
            decodedUid = payload.user_id || payload.sub;
            decodedEmail = payload.email ? payload.email.toLowerCase() : decodedEmail;
            isVerified = !!payload.email_verified;
          }
        } catch (parseErr) {}
      }
    }

    if (!decodedEmail && !decodedUid) {
      return res.status(400).json({ error: 'Valid Firebase ID token or email is required.' });
    }

    let users = [];
    if (decodedUid) {
      const byUid = await getDoc(COLLECTIONS.USERS, decodedUid);
      if (byUid) users = [byUid];
    }
    if (users.length === 0 && decodedEmail) {
      users = await queryDocs(COLLECTIONS.USERS, [['email', '==', decodedEmail]], null, 'asc', 1);
      // If found by email with different user_id, re-map to current Firebase UID
      if (users.length > 0 && decodedUid && users[0].user_id !== decodedUid) {
        const oldId = users[0].user_id;
        users[0].user_id = decodedUid;
        await setDoc(COLLECTIONS.USERS, decodedUid, { ...users[0], user_id: decodedUid });
        const oldSp = await getDoc(COLLECTIONS.STUDENT_PROFILES, oldId);
        if (oldSp) {
          await setDoc(COLLECTIONS.STUDENT_PROFILES, decodedUid, { ...oldSp, user_id: decodedUid });
        }
        const oldStp = await getDoc(COLLECTIONS.STAFF_PROFILES, oldId);
        if (oldStp) {
          await setDoc(COLLECTIONS.STAFF_PROFILES, decodedUid, { ...oldStp, user_id: decodedUid });
        }
      }
    }

    if (users.length === 0) {
      return res.json({
        profileMissing: true,
        message: 'No profile found for this user. Please complete registration.',
        uid: decodedUid,
        email: decodedEmail,
        emailVerified: isVerified
      });
    }

    const user = users[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });
    }

    if (isVerified && !user.email_verified) {
      await updateDoc(COLLECTIONS.USERS, user.user_id, { email_verified: 1 });
      user.email_verified = 1;
    }

    // Role-based verification guard: Block unverified Student, Faculty, and Mentor
    if (!isVerified && !user.email_verified && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Email verification required. Please check your Gmail inbox and click the verification link before logging in.',
        unverified: true,
        email: user.email
      });
    }

    let profile = null;
    if (user.role === 'student') {
      profile = await getDoc(COLLECTIONS.STUDENT_PROFILES, user.user_id) || {};
    } else {
      profile = await getDoc(COLLECTIONS.STAFF_PROFILES, user.user_id) || {};
    }

    const tokens = generateTokens(user);

    await updateDoc(COLLECTIONS.USERS, user.user_id, {
      failed_login_attempts: 0,
      lockout_until: null,
      last_login: nowISO()
    });

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
        profileCompleteness: profile.profile_completeness || 0,
        emailVerified: true
      },
      ...tokens
    });
  } catch (err) {
    console.error('firebaseLogin error:', err);
    return res.status(500).json({ error: 'Server error during Firebase login.' });
  }
}

// POST /api/auth/complete-profile
async function completeProfile(req, res) {
  try {
    const {
      uid, email, role = 'student', fullName,
      sapId, schoolId, programId, semester, year,
      department, designation, emailVerified = false
    } = req.body;

    if (!uid || !email || !fullName) {
      return res.status(400).json({ error: 'UID, email, and full name are required.' });
    }

    let isVerified = !!emailVerified;

    // Verify token if authorization header passed
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      try {
        const { getAuth } = require('../utils/firebaseAdmin');
        const decoded = await getAuth().verifyIdToken(idToken);
        if (decoded.uid !== uid) {
          return res.status(403).json({ error: 'UID mismatch with authenticated session.' });
        }
        if (decoded.email_verified) isVerified = true;
      } catch (e) {
        try {
          const base64Url = idToken.split('.')[1];
          if (base64Url) {
            const payload = JSON.parse(Buffer.from(base64Url, 'base64').toString());
            if ((payload.user_id && payload.user_id !== uid) || (payload.sub && payload.sub !== uid)) {
              return res.status(403).json({ error: 'UID mismatch with authenticated session.' });
            }
            if (payload.email_verified) isVerified = true;
          }
        } catch (pe) {}
      }
    }

    // Role cannot be admin
    const requestedRole = ['student', 'faculty', 'mentor'].includes(role) ? role : 'student';
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2 || !/^[a-zA-Z\s]+$/.test(trimmedName)) {
      return res.status(400).json({ error: 'Full name must contain letters and spaces only (minimum 2 characters).' });
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (requestedRole === 'student') {
      if (!sapId || !/^7\d{10}$/.test(sapId.trim())) {
        return res.status(400).json({ error: 'SAP ID must be exactly 11 digits, numeric only, and start with 7.' });
      }
      if (!schoolId || !programId) {
        return res.status(400).json({ error: 'Please select a school and program.' });
      }
    } else {
      if (!department || !department.trim()) {
        return res.status(400).json({ error: 'Department is required.' });
      }
      if (!designation || !designation.trim()) {
        return res.status(400).json({ error: 'Designation is required.' });
      }
    }

    const now = nowISO();

    // Check if user document exists
    const existingUser = await getDoc(COLLECTIONS.USERS, uid);
    const finalRole = (existingUser && existingUser.role && existingUser.role !== 'admin')
      ? existingUser.role
      : requestedRole;

    // Create user record in Firestore
    await setDoc(COLLECTIONS.USERS, uid, {
      user_id: uid,
      sap_id: finalRole === 'student' ? sapId.trim() : null,
      email: trimmedEmail,
      role: finalRole,
      status: 'active',
      email_verified: isVerified ? 1 : 0,
      failed_login_attempts: 0,
      lockout_until: null,
      created_at: existingUser ? existingUser.created_at : now,
      last_login: now
    });

    let profile = {};
    if (finalRole === 'student') {
      profile = {
        user_id: uid,
        full_name: trimmedName,
        school_id: schoolId || null,
        program_id: programId || null,
        semester: semester ? parseInt(semester, 10) : 1,
        year: year ? parseInt(year, 10) : 1,
        mentor_id: null,
        bio: null,
        photo_url: null,
        study_mode: 'both',
        open_to_requests: 1,
        show_email: 0,
        show_availability: 1,
        profile_completeness: 40,
        created_at: now
      };
      await setDoc(COLLECTIONS.STUDENT_PROFILES, uid, profile);
    } else {
      profile = {
        user_id: uid,
        full_name: trimmedName,
        department: department.trim(),
        designation: designation.trim(),
        expertise: null,
        photo_url: null
      };
      await setDoc(COLLECTIONS.STAFF_PROFILES, uid, profile);
    }

    // If email is not verified, do not issue login tokens; require verification
    if (!isVerified && finalRole !== 'admin') {
      return res.status(201).json({
        message: 'Profile completed successfully. Email verification is required before logging in.',
        requiresVerification: true,
        email: trimmedEmail
      });
    }

    const safeUser = {
      userId: uid,
      email: trimmedEmail,
      sapId: finalRole === 'student' ? sapId.trim() : null,
      role: finalRole,
      fullName: trimmedName,
      photoUrl: null,
      semester: profile.semester || null,
      profileCompleteness: profile.profile_completeness || 0,
      emailVerified: true
    };

    const tokens = generateTokens({
      user_id: uid,
      email: trimmedEmail,
      role: finalRole,
      sap_id: safeUser.sapId
    });

    return res.status(201).json({
      message: 'Profile completed successfully.',
      user: safeUser,
      ...tokens
    });
  } catch (err) {
    console.error('completeProfile error:', err);
    return res.status(500).json({ error: 'Failed to complete profile.' });
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
  syncProfile,
  firebaseLogin,
  completeProfile,
  hashToken
};

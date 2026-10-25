// Enforce SQLite only for testing: delete postgres env variables before requiring db
delete process.env.DATABASE_URL;
delete process.env.DB_HOST;
delete process.env.DB_USER;
delete process.env.DB_PASSWORD;

process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key_12345';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin.test@gmail.com';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'AdminTest@123';
process.env.BOOTSTRAP_ADMIN_NAME = 'Test Administrator';

const assert = require('assert');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, isPostgresConfigured } = require('../src/database/db');
const migrate = require('../src/database/migrate');
const { seedMasterData, ensureBootstrapAdmin } = require('../src/database/seed');
const { register, login, forgotPassword, resetPassword, verifyEmail, hashToken } = require('../src/controllers/authController');
const { sendRequest } = require('../src/controllers/requestController');
const { proposeSession } = require('../src/controllers/sessionController');
const { downloadAttachment } = require('../src/controllers/chatController');
const { createUser } = require('../src/controllers/adminController');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    download(path, filename) {
      this.downloadPath = path;
      this.downloadFilename = filename;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('====================================================================');
  console.log(' NMIMS Peer Buddy System — Comprehensive Security & Regression Tests');
  console.log('====================================================================\n');

  // Verify running on SQLite
  assert.strictEqual(isPostgresConfigured(), false, 'Test runner MUST use SQLite only and never touch PostgreSQL / Supabase.');

  // Initialize SQLite schema and master data
  await migrate();
  await seedMasterData();
  await ensureBootstrapAdmin();

  // Create isolated test users for the test suite (all with @gmail.com)
  const testStudentEmail = 'test.student@gmail.com';
  const testMentorEmail = 'test.mentor@gmail.com';
  const testFacultyEmail = 'test.faculty@gmail.com';
  const testPassword = 'SecurePassword@123';
  const testHash = await bcrypt.hash(testPassword, 10);

  const studentUserRes = await query('SELECT * FROM users WHERE email = ?', [testStudentEmail]);
  let studentUserId = studentUserRes.rows[0]?.user_id;
  if (!studentUserId) {
    studentUserId = 'usr-test-student';
    await query(`
      INSERT INTO users (user_id, sap_id, email, password_hash, role, status, email_verified)
      VALUES (?, '79999999999', ?, ?, 'student', 'active', 1)
    `, [studentUserId, testStudentEmail, testHash]);

    await query(`
      INSERT INTO student_profiles (user_id, full_name, school_id, program_id, semester, year, bio, study_mode, open_to_requests, show_email, show_availability, profile_completeness)
      VALUES (?, 'Test Student', 'sch-stme', 'prog-csds', 3, 2, 'Bio', 'both', 1, 0, 1, 85)
    `, [studentUserId]);
  }

  const mentorUserRes = await query('SELECT * FROM users WHERE email = ?', [testMentorEmail]);
  let mentorUserId = mentorUserRes.rows[0]?.user_id;
  if (!mentorUserId) {
    mentorUserId = 'usr-test-mentor';
    await query(`
      INSERT INTO users (user_id, email, password_hash, role, status, email_verified)
      VALUES (?, ?, ?, 'mentor', 'active', 1)
    `, [mentorUserId, testMentorEmail, testHash]);

    await query(`
      INSERT INTO staff_profiles (user_id, full_name, department, designation, expertise)
      VALUES (?, 'Test Mentor', 'Computer Engineering', 'Senior Mentor', 'Mentoring')
    `, [mentorUserId]);
  }

  const facultyUserRes = await query('SELECT * FROM users WHERE email = ?', [testFacultyEmail]);
  let facultyUserId = facultyUserRes.rows[0]?.user_id;
  if (!facultyUserId) {
    facultyUserId = 'usr-test-faculty';
    await query(`
      INSERT INTO users (user_id, email, password_hash, role, status, email_verified)
      VALUES (?, ?, ?, 'faculty', 'active', 1)
    `, [facultyUserId, testFacultyEmail, testHash]);

    await query(`
      INSERT INTO staff_profiles (user_id, full_name, department, designation, expertise)
      VALUES (?, 'Test Faculty', 'Computer Engineering', 'Assistant Professor', 'Research')
    `, [facultyUserId]);
  }

  console.log('✓ PASS: Isolated SQLite test accounts verified.');

  // 1. Password Reset Token Security
  console.log('\n--- Password Reset & Auth Security Verification ---');
  const forgotRes = createMockRes();
  await forgotPassword({ body: { email: testStudentEmail } }, forgotRes);
  assert.strictEqual(forgotRes.statusCode, 200);
  assert.strictEqual(forgotRes.body.resetToken, undefined, 'Raw reset token MUST NOT be exposed in response body');
  assert.ok(forgotRes.body.message.includes('password reset link has been dispatched'), 'Generic message returned');

  // Verify non-registered email returns generic message (prevent enumeration)
  const nonExistentRes = createMockRes();
  await forgotPassword({ body: { email: 'unknown999@gmail.com' } }, nonExistentRes);
  assert.strictEqual(nonExistentRes.statusCode, 200);
  assert.strictEqual(nonExistentRes.body.resetToken, undefined);

  // Single-use token invalidation
  const rawTestToken = crypto.randomBytes(32).toString('hex');
  const hashedTestToken = hashToken(rawTestToken);
  await query('INSERT INTO password_resets (token, email, expires_at) VALUES (?, ?, ?)', [
    hashedTestToken,
    testStudentEmail,
    new Date(Date.now() + 15 * 60 * 1000).toISOString()
  ]);

  const resetReqRes = createMockRes();
  await resetPassword({
    body: { token: rawTestToken, newPassword: 'NewSecurePassword@123' }
  }, resetReqRes);
  assert.strictEqual(resetReqRes.statusCode, 200);

  const postResetCheck = await query('SELECT * FROM password_resets WHERE token = ?', [hashedTestToken]);
  assert.strictEqual(postResetCheck.rowCount, 0, 'Token must be deleted immediately after consumption');

  const reuseRes = createMockRes();
  await resetPassword({
    body: { token: rawTestToken, newPassword: 'AnotherPassword@123' }
  }, reuseRes);
  assert.strictEqual(reuseRes.statusCode, 400, 'Reused reset token must be rejected');

  // Restore password hash
  await query("UPDATE users SET password_hash = ? WHERE email = ?", [testHash, testStudentEmail]);
  console.log('✓ PASS: Password reset tokens are securely hashed and single-use.');

  // 2. Email domain rejection and acceptance tests
  console.log('\n--- Email Rules and Role Registration Tests ---');

  // Reject @nmims.in
  const rejectNmimsInRes = createMockRes();
  await register({
    body: {
      role: 'student',
      fullName: 'Student Name',
      email: `student_${Date.now()}@nmims.in`,
      password: 'StrongPassword@123',
      sapId: '70572400001',
      semester: 1,
      schoolId: 'sch-stme',
      programId: 'prog-csds'
    }
  }, rejectNmimsInRes);
  assert.strictEqual(rejectNmimsInRes.statusCode, 400, 'Must reject @nmims.in');

  // Reject @nmims.edu
  const rejectNmimsEduRes = createMockRes();
  await register({
    body: {
      role: 'faculty',
      fullName: 'Faculty Name',
      email: `faculty_${Date.now()}@nmims.edu`,
      password: 'StrongPassword@123',
      department: 'CSE',
      designation: 'Assistant Professor'
    }
  }, rejectNmimsEduRes);
  assert.strictEqual(rejectNmimsEduRes.statusCode, 400, 'Must reject @nmims.edu');

  // Reject invalid SAP ID for student
  const invalidSapRes = createMockRes();
  await register({
    body: {
      role: 'student',
      fullName: 'Student Valid',
      email: `student_${Date.now()}@gmail.com`,
      password: 'StrongPassword@123',
      sapId: '60000000001',
      semester: 1,
      schoolId: 'sch-stme',
      programId: 'prog-csds'
    }
  }, invalidSapRes);
  assert.strictEqual(invalidSapRes.statusCode, 400, 'Must reject invalid SAP ID');

  // Accept valid student registration with @gmail.com
  const validStudentRes = createMockRes();
  const regStudentEmail = `reg_student_${Date.now()}@gmail.com`;
  await register({
    body: {
      role: 'student',
      fullName: 'Security Tester',
      email: regStudentEmail,
      password: 'StrongPassword@123',
      sapId: `7057${Math.floor(1000000 + Math.random() * 9000000)}`,
      semester: 1,
      schoolId: 'sch-stme',
      programId: 'prog-csds'
    }
  }, validStudentRes);
  assert.strictEqual(validStudentRes.statusCode, 201, 'Valid student registration with @gmail.com must succeed');

  // Accept mentor registration with @gmail.com
  const validMentorRes = createMockRes();
  const regMentorEmail = `reg_mentor_${Date.now()}@gmail.com`;
  await register({
    body: {
      role: 'mentor',
      fullName: 'Dr Mentor',
      email: regMentorEmail,
      password: 'StrongPassword@123',
      department: 'Computer Science',
      designation: 'Mentor'
    }
  }, validMentorRes);
  assert.strictEqual(validMentorRes.statusCode, 201, 'Mentor registration with @gmail.com must succeed');

  // Accept faculty registration with @gmail.com
  const validFacultyRes = createMockRes();
  const regFacultyEmail = `reg_faculty_${Date.now()}@gmail.com`;
  await register({
    body: {
      role: 'faculty',
      fullName: 'Prof Faculty',
      email: regFacultyEmail,
      password: 'StrongPassword@123',
      department: 'Computer Science',
      designation: 'Professor'
    }
  }, validFacultyRes);
  assert.strictEqual(validFacultyRes.statusCode, 201, 'Faculty registration with @gmail.com must succeed');

  console.log('✓ PASS: All accounts accept ONLY @gmail.com and reject @nmims.in and @nmims.edu.');

  // 3. Email verification token endpoint
  console.log('\n--- Email Verification Token Tests ---');
  const rawVerifyToken = crypto.randomBytes(32).toString('hex');
  const hashedVerifyToken = hashToken(rawVerifyToken);
  await query('INSERT INTO email_verifications (token, email, expires_at) VALUES (?, ?, ?)', [
    hashedVerifyToken,
    regStudentEmail,
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  ]);

  const verifyRes = createMockRes();
  await verifyEmail({ body: { token: rawVerifyToken } }, verifyRes);
  assert.strictEqual(verifyRes.statusCode, 200);

  const verifyTokenPost = await query('SELECT * FROM email_verifications WHERE token = ?', [hashedVerifyToken]);
  assert.strictEqual(verifyTokenPost.rowCount, 0, 'Verification token must be deleted after use');
  console.log('✓ PASS: Email verification works securely with token consumption.');

  // 4. Chat Attachment Access Control
  console.log('\n--- Chat Attachment Access Control ---');
  const connId = `conn-test-${Date.now()}`;
  const msgId = `msg-test-${Date.now()}`;

  await query("INSERT INTO connections (connection_id, user_a, user_b, status) VALUES (?, ?, ?, 'active')", [
    connId,
    studentUserId,
    mentorUserId
  ]);

  await query(`
    INSERT INTO messages (message_id, connection_id, sender_id, body, attachment_url, attachment_name)
    VALUES (?, ?, ?, 'Private note', 'https://example.com/test.pdf', 'test.pdf')
  `, [msgId, connId, studentUserId]);

  const unauthDownloadRes = createMockRes();
  await downloadAttachment({
    user: { userId: facultyUserId, role: 'faculty' },
    params: { messageId: msgId }
  }, unauthDownloadRes);
  assert.strictEqual(unauthDownloadRes.statusCode, 403, 'Unauthorized third party must be denied attachment access');
  console.log('✓ PASS: Attachment horizontal access control verified.');

  // 5. Account Lockout Protection (Brute Force Protection)
  console.log('\n--- Brute Force Lockout Verification ---');
  for (let i = 1; i <= 5; i++) {
    const lockRes = createMockRes();
    await login({
      body: {
        email: testStudentEmail,
        password: 'WrongPassword99'
      }
    }, lockRes);
    if (i === 5) {
      assert.strictEqual(lockRes.statusCode, 429, '5 failed logins must trigger 429 lockout');
    }
  }
  await query("UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE email = ?", [testStudentEmail]);
  console.log('✓ PASS: Brute-force lockout (5 failed attempts -> 429) verified.');

  // 6. Session Conflict Detection
  console.log('\n--- Session Conflict Verification ---');
  const uniqueOffsetHours = Math.floor(100 + Math.random() * 5000);
  const startAt = new Date(Date.now() + uniqueOffsetHours * 3600 * 1000).toISOString();
  const endAt = new Date(Date.now() + (uniqueOffsetHours + 2) * 3600 * 1000).toISOString();

  const sessRes1 = createMockRes();
  await proposeSession({
    user: { userId: studentUserId },
    body: {
      partnerId: mentorUserId,
      title: 'Peer Review',
      subject: 'Algorithms',
      startAt,
      endAt,
      mode: 'online',
      locationOrLink: 'https://meet.google.com'
    }
  }, sessRes1);
  assert.strictEqual(sessRes1.statusCode, 201);

  const sessRes2 = createMockRes();
  await proposeSession({
    user: { userId: studentUserId },
    body: {
      partnerId: mentorUserId,
      title: 'Conflicting Review',
      subject: 'Algorithms',
      startAt,
      endAt,
      mode: 'online',
      locationOrLink: 'https://meet.google.com'
    }
  }, sessRes2);
  assert.strictEqual(sessRes2.statusCode, 409, 'Overlapping session slot must return 409 conflict');
  console.log('✓ PASS: Overlapping session conflict correctly detected and rejected.');

  console.log('\n====================================================================');
  console.log(' ALL TESTS PASSED ON SQLITE (0 POSTGRES WRITES)');
  console.log('====================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});

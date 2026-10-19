const assert = require('assert');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../src/database/db');
const seed = require('../src/database/seed');
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
    }
  };
  return res;
}

async function runTests() {
  console.log('====================================================================');
  console.log(' NMIMS Peer Buddy System — Comprehensive Security & Regression Tests');
  console.log('====================================================================\n');

  // 1. Verify Idempotent Seed & 4 Master Accounts
  await seed();
  const accounts = [
    { email: 'student@nmims.in', role: 'student', sapId: '70000000001', expectedPass: 'Student@123' },
    { email: 'mentor@nmims.in', role: 'mentor', sapId: null, expectedPass: 'Mentor@123' },
    { email: 'faculty@nmims.in', role: 'faculty', sapId: null, expectedPass: 'Faculty@123' },
    { email: 'admin@nmims.in', role: 'admin', sapId: null, expectedPass: 'Admin@123' }
  ];

  for (const acc of accounts) {
    const userRes = await query('SELECT * FROM users WHERE email = ?', [acc.email]);
    assert.strictEqual(userRes.rowCount, 1, `Account ${acc.email} must exist`);
    const user = userRes.rows[0];
    assert.strictEqual(user.role, acc.role, `Account ${acc.email} role must be ${acc.role}`);
    assert.strictEqual(user.status, 'active', `Account ${acc.email} must be active`);
    assert.strictEqual(user.email_verified, 1, `Account ${acc.email} must be verified`);

    const isMatch = await bcrypt.compare(acc.expectedPass, user.password_hash);
    assert.strictEqual(isMatch, true, `Account ${acc.email} password verification failed`);
  }
  console.log('✓ PASS: All 4 test accounts exist, active, verified with valid bcrypt hashes.');

  // 2. CHANGE 1: Password Reset Token Security
  console.log('\n--- CHANGE 1: Password Reset & Auth Security Verification ---');
  const forgotRes = createMockRes();
  await forgotPassword({ body: { email: 'student@nmims.in' } }, forgotRes);
  assert.strictEqual(forgotRes.statusCode, 200);
  assert.strictEqual(forgotRes.body.resetToken, undefined, 'CRITICAL: Raw reset token MUST NOT be exposed in response body');
  assert.ok(forgotRes.body.message.includes('password reset link has been dispatched'), 'Generic message returned');

  // Verify non-registered email returns generic message (prevent enumeration)
  const nonExistentRes = createMockRes();
  await forgotPassword({ body: { email: 'unknown999@nmims.in' } }, nonExistentRes);
  assert.strictEqual(nonExistentRes.statusCode, 200);
  assert.strictEqual(nonExistentRes.body.resetToken, undefined);

  // Verify database stores only SHA-256 hash of token, not plaintext
  const resetRecordRes = await query('SELECT * FROM password_resets WHERE email = ?', ['student@nmims.in']);
  assert.strictEqual(resetRecordRes.rowCount, 1);
  const resetRecord = resetRecordRes.rows[0];
  assert.strictEqual(resetRecord.token.length, 64, 'Stored token must be a 64-character SHA-256 hex digest');
  assert.strictEqual(/^[0-9a-f]{64}$/.test(resetRecord.token), true, 'Valid SHA-256 format');

  // Test single-use and invalidation: create test raw token and test resetPassword
  const rawTestToken = crypto.randomBytes(32).toString('hex');
  const hashedTestToken = hashToken(rawTestToken);
  await query('INSERT INTO password_resets (token, email, expires_at) VALUES (?, ?, ?)', [
    hashedTestToken,
    'student@nmims.in',
    new Date(Date.now() + 15 * 60 * 1000).toISOString()
  ]);

  const resetReqRes = createMockRes();
  await resetPassword({
    body: { token: rawTestToken, newPassword: 'NewSecurePassword@123' }
  }, resetReqRes);
  assert.strictEqual(resetReqRes.statusCode, 200);
  assert.ok(resetReqRes.body.message.includes('successfully'));

  // Verify token was deleted immediately after single use
  const postResetCheck = await query('SELECT * FROM password_resets WHERE token = ?', [hashedTestToken]);
  assert.strictEqual(postResetCheck.rowCount, 0, 'Token must be deleted immediately after consumption');

  // Verify reuse of same token is rejected
  const reuseRes = createMockRes();
  await resetPassword({
    body: { token: rawTestToken, newPassword: 'AnotherPassword@123' }
  }, reuseRes);
  assert.strictEqual(reuseRes.statusCode, 400, 'Reused reset token must be rejected');

  // Restore student password for test suite compatibility
  const originalStudentHash = await bcrypt.hash('Student@123', 10);
  await query('UPDATE users SET password_hash = ? WHERE email = "student@nmims.in"', [originalStudentHash]);
  console.log('✓ PASS: Password reset token exposure removed; cryptographically hashed single-use tokens verified.');

  // 3. CHANGE 4: Public Registration & Role Escalation Prevention
  console.log('\n--- CHANGE 4: Public Registration & Role Escalation Prevention ---');
  // Attempt to register with role = 'admin'
  const escalateRes = createMockRes();
  const testStudentEmail = `sec_test_${Date.now()}@nmims.in`;
  await register({
    body: {
      fullName: 'Security Tester',
      email: testStudentEmail,
      password: 'Password@123',
      role: 'admin', // Attack payload attempting to gain admin
      sapId: `7000${Math.floor(1000000 + Math.random() * 9000000)}`
    }
  }, escalateRes);
  assert.strictEqual(escalateRes.statusCode, 201);
  assert.strictEqual(escalateRes.body.role, 'student', 'Public registration MUST force role to student');

  const checkUser = (await query('SELECT role FROM users WHERE email = ?', [testStudentEmail])).rows[0];
  assert.strictEqual(checkUser.role, 'student', 'Database record must be student regardless of input role');
  console.log('✓ PASS: Vertical privilege escalation blocked. Public registration creates only Student role.');

  // Verify non-NMIMS email domain rejection
  const nonNmimsRes = createMockRes();
  await register({
    body: {
      fullName: 'External User',
      email: 'user@gmail.com',
      password: 'Password@123'
    }
  }, nonNmimsRes);
  assert.strictEqual(nonNmimsRes.statusCode, 400, 'Non-NMIMS domain rejected with 400');
  console.log('✓ PASS: Non-NMIMS domain rejection enforced.');

  // 4. CHANGE 4: Email Verification Token Endpoint
  console.log('\n--- CHANGE 4: Email Verification Token Tests ---');
  const rawVerifyToken = crypto.randomBytes(32).toString('hex');
  const hashedVerifyToken = hashToken(rawVerifyToken);
  await query('INSERT INTO email_verifications (token, email, expires_at) VALUES (?, ?, ?)', [
    hashedVerifyToken,
    testStudentEmail,
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  ]);

  const verifyRes = createMockRes();
  await verifyEmail({ body: { token: rawVerifyToken } }, verifyRes);
  assert.strictEqual(verifyRes.statusCode, 200);

  // Confirm user is verified and token consumed
  const verifiedUser = (await query('SELECT email_verified FROM users WHERE email = ?', [testStudentEmail])).rows[0];
  assert.strictEqual(verifiedUser.email_verified, 1);
  const verifyTokenPost = await query('SELECT * FROM email_verifications WHERE token = ?', [hashedVerifyToken]);
  assert.strictEqual(verifyTokenPost.rowCount, 0, 'Verification token must be deleted after use');
  console.log('✓ PASS: Token-based email verification functions securely with single-use hash invalidation.');

  // 5. CHANGE 3: Chat Attachment Access Control
  console.log('\n--- CHANGE 3: Chat Attachment Access Control ---');
  // Create test connection between student and testStudent2
  const connId = `conn-test-${Date.now()}`;
  const msgId = `msg-test-${Date.now()}`;
  const studentUser = (await query('SELECT user_id FROM users WHERE email = "student@nmims.in"')).rows[0];
  const mentorUser = (await query('SELECT user_id FROM users WHERE email = "mentor@nmims.in"')).rows[0];
  const facultyUser = (await query('SELECT user_id FROM users WHERE email = "faculty@nmims.in"')).rows[0];

  await query('INSERT INTO connections (connection_id, user_a, user_b, status) VALUES (?, ?, ?, "active")', [
    connId,
    studentUser.user_id,
    mentorUser.user_id
  ]);

  await query(`
    INSERT INTO messages (message_id, connection_id, sender_id, body, attachment_url, attachment_name)
    VALUES (?, ?, ?, 'Private note', '/uploads/test.pdf', 'test.pdf')
  `, [msgId, connId, studentUser.user_id]);

  // Unauthorized user (facultyUser) attempting to access private attachment
  const unauthDownloadRes = createMockRes();
  await downloadAttachment({
    user: { userId: facultyUser.user_id, role: 'faculty' },
    params: { messageId: msgId }
  }, unauthDownloadRes);
  assert.strictEqual(unauthDownloadRes.statusCode, 403, 'Unauthorized third party must be denied attachment access with 403');
  console.log('✓ PASS: Horizontal access control on chat attachments verified (403 Forbidden for non-participants).');

  // 6. Account Lockout Protection (Brute Force Protection)
  console.log('\n--- Authentication & Rate Limiting Verification ---');
  for (let i = 1; i <= 5; i++) {
    const lockRes = createMockRes();
    await login({
      body: {
        email: 'student@nmims.in',
        password: 'WrongPassword99'
      }
    }, lockRes);
    if (i === 5) {
      assert.strictEqual(lockRes.statusCode, 429, '5 failed logins must trigger 429 lockout');
    }
  }
  // Reset student lockout
  await query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE email = "student@nmims.in"');
  console.log('✓ PASS: Brute-force login lockout (5 failed attempts -> 429) verified.');

  // 7. Session Conflict & Scheduling Rules
  console.log('\n--- Session Conflict & Business Logic Verification ---');
  const uniqueOffsetHours = Math.floor(100 + Math.random() * 5000);
  const startAt = new Date(Date.now() + uniqueOffsetHours * 3600 * 1000).toISOString();
  const endAt = new Date(Date.now() + (uniqueOffsetHours + 2) * 3600 * 1000).toISOString();

  const sessRes1 = createMockRes();
  await proposeSession({
    user: { userId: studentUser.user_id },
    body: {
      partnerId: mentorUser.user_id,
      title: 'Peer Review',
      subject: 'Algorithms',
      startAt,
      endAt,
      mode: 'online',
      locationOrLink: 'https://meet.google.com'
    }
  }, sessRes1);
  assert.strictEqual(sessRes1.statusCode, 201);

  // Propose conflicting session
  const sessRes2 = createMockRes();
  await proposeSession({
    user: { userId: studentUser.user_id },
    body: {
      partnerId: mentorUser.user_id,
      title: 'Conflicting Review',
      subject: 'Algorithms',
      startAt,
      endAt,
      mode: 'online',
      locationOrLink: 'https://meet.google.com'
    }
  }, sessRes2);
  assert.strictEqual(sessRes2.statusCode, 409, 'Overlapping session slot must return 409 conflict');
  console.log('✓ PASS: Session schedule conflict correctly detected and prevented.');

  console.log('\n====================================================================');
  console.log(' ALL COMPREHENSIVE SECURITY & INTEGRATION TESTS PASSED (100%)');
  console.log('====================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});

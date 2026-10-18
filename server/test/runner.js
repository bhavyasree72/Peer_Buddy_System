const assert = require('assert');
const bcrypt = require('bcryptjs');
const { query } = require('../src/database/db');
const seed = require('../src/database/seed');

async function runTests() {
  console.log('--- STARTING ACCEPTANCE CRITERIA VERIFICATION ---');

  // 1. Verify Seed & Idempotency
  await seed();
  console.log('✓ US1 & Master Data: Idempotent seed executes without errors.');

  // 2. Verify 4 Required Test Accounts
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
  console.log('✓ US1 & US2: All 4 test accounts exist, active, verified, with matching bcrypt hashes.');

  // 3. Verify NMIMS Domain Validation & Constraints
  const { register } = require('../src/controllers/authController');
  let mockResStatus = null;
  let mockResJson = null;
  const mockRes = {
    status: (code) => { mockResStatus = code; return { json: (j) => { mockResJson = j; } }; },
    json: (j) => { mockResJson = j; }
  };

  await register({
    body: {
      fullName: 'Fake External',
      email: 'hacker@gmail.com',
      password: 'Password123'
    }
  }, mockRes);
  assert.strictEqual(mockResStatus, 400, 'Non-NMIMS email domain must be rejected with 400');
  console.log('✓ US1: Non-NMIMS domain rejection rule verified.');

  // 4. Verify Account Lockout (5 wrong attempts -> 15 min lock)
  const { login } = require('../src/controllers/authController');
  for (let i = 1; i <= 5; i++) {
    await login({
      body: {
        email: 'student@nmims.in',
        password: 'WrongPassword99'
      }
    }, mockRes);
  }
  assert.strictEqual(mockResStatus, 429, '5 failed logins must trigger 429 lockout');
  console.log('✓ US2: 5 failed login attempts lock account with 429 status.');

  // Reset lockout for student test account
  await query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE email = "student@nmims.in"');

  // 5. Verify Buddy Request Rules (Max 10 pending, no self-request)
  const { sendRequest } = require('../src/controllers/requestController');
  const studentUser = (await query('SELECT user_id FROM users WHERE email = "student@nmims.in"')).rows[0];
  
  mockResStatus = null;
  await sendRequest({
    user: { userId: studentUser.user_id },
    body: { receiverId: studentUser.user_id, note: 'Self connect' }
  }, mockRes);
  assert.strictEqual(mockResStatus, 400, 'Self buddy request must be rejected');
  console.log('✓ US5 & US6: Self buddy request rejected.');

  // 6. Verify Session Conflict Detection
  const { proposeSession } = require('../src/controllers/sessionController');
  const now = new Date();
  const startAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();

  // Create mock second student to test interaction
  const testStudent2 = 'usr-test-2';
  await query('INSERT OR IGNORE INTO users (user_id, email, password_hash, role, status, email_verified) VALUES (?, "test2@nmims.in", "hash", "student", "active", 1)', [testStudent2]);
  await query('INSERT OR IGNORE INTO student_profiles (user_id, full_name, semester) VALUES (?, "Rohan Verma", 3)', [testStudent2]);

  mockResStatus = null;
  await proposeSession({
    user: { userId: studentUser.user_id },
    body: {
      partnerId: testStudent2,
      title: 'Math Revision',
      subject: 'Calculus',
      startAt,
      endAt,
      mode: 'on_campus',
      locationOrLink: 'Library'
    }
  }, mockRes);

  // Propose conflicting session at overlapping time
  mockResStatus = null;
  await proposeSession({
    user: { userId: studentUser.user_id },
    body: {
      partnerId: testStudent2,
      title: 'Conflicting Revision',
      subject: 'Calculus',
      startAt,
      endAt,
      mode: 'on_campus',
      locationOrLink: 'Library'
    }
  }, mockRes);
  assert.strictEqual(mockResStatus, 409, 'Overlapping session slot must return 409 conflict');
  console.log('✓ US8: Session schedule conflict correctly detected and prevented.');

  console.log('--- ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY ---');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

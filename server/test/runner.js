// Test runner for Firebase Firestore mode
process.env.JWT_SECRET = 'test_jwt_secret_key_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_key_12345';
process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin.test@gmail.com';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'AdminTest@123';
process.env.BOOTSTRAP_ADMIN_NAME = 'Test Administrator';

const assert = require('assert');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  queryDocs,
  nowISO
} = require('../src/database/firestoreDb');
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
  console.log(' NMIMS Peer Buddy System — Firebase & Security Regression Tests');
  console.log('====================================================================\n');

  // Initialize master data
  await migrate();
  await seedMasterData();
  await ensureBootstrapAdmin();

  // Create isolated test users for the test suite (all with @gmail.com)
  const testStudentEmail = 'test.student@gmail.com';
  const testMentorEmail = 'test.mentor@gmail.com';
  const testFacultyEmail = 'test.faculty@gmail.com';
  const testPassword = 'SecurePassword@123';
  const testHash = await bcrypt.hash(testPassword, 10);

  let studentUserId = 'usr-test-student';
  await setDoc(COLLECTIONS.USERS, studentUserId, {
    user_id: studentUserId,
    sap_id: '79999999999',
    email: testStudentEmail,
    password_hash: testHash,
    role: 'student',
    status: 'active',
    email_verified: 1,
    failed_login_attempts: 0,
    lockout_until: null,
    created_at: nowISO()
  });

  await setDoc(COLLECTIONS.STUDENT_PROFILES, studentUserId, {
    user_id: studentUserId,
    full_name: 'Test Student',
    school_id: 'sch-stme',
    program_id: 'prog-csds',
    semester: 3,
    year: 2,
    bio: 'Bio',
    study_mode: 'both',
    open_to_requests: 1,
    show_email: 0,
    show_availability: 1,
    profile_completeness: 85
  });

  let mentorUserId = 'usr-test-mentor';
  await setDoc(COLLECTIONS.USERS, mentorUserId, {
    user_id: mentorUserId,
    email: testMentorEmail,
    password_hash: testHash,
    role: 'mentor',
    status: 'active',
    email_verified: 1,
    created_at: nowISO()
  });

  await setDoc(COLLECTIONS.STAFF_PROFILES, mentorUserId, {
    user_id: mentorUserId,
    full_name: 'Test Mentor',
    department: 'Computer Engineering',
    designation: 'Senior Mentor',
    expertise: 'Mentoring'
  });

  let facultyUserId = 'usr-test-faculty';
  await setDoc(COLLECTIONS.USERS, facultyUserId, {
    user_id: facultyUserId,
    email: testFacultyEmail,
    password_hash: testHash,
    role: 'faculty',
    status: 'active',
    email_verified: 1,
    created_at: nowISO()
  });

  await setDoc(COLLECTIONS.STAFF_PROFILES, facultyUserId, {
    user_id: facultyUserId,
    full_name: 'Test Faculty',
    department: 'Computer Engineering',
    designation: 'Assistant Professor',
    expertise: 'Research'
  });

  console.log('✓ PASS: Isolated test accounts verified.');

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
  await setDoc(COLLECTIONS.PASSWORD_RESETS, hashedTestToken, {
    token: hashedTestToken,
    email: testStudentEmail,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });

  const resetReqRes = createMockRes();
  await resetPassword({
    body: { token: rawTestToken, newPassword: 'NewSecurePassword@123' }
  }, resetReqRes);
  assert.strictEqual(resetReqRes.statusCode, 200);

  const postResetCheck = await getDoc(COLLECTIONS.PASSWORD_RESETS, hashedTestToken);
  assert.strictEqual(postResetCheck, null, 'Token must be deleted immediately after consumption');

  const reuseRes = createMockRes();
  await resetPassword({
    body: { token: rawTestToken, newPassword: 'AnotherPassword@123' }
  }, reuseRes);
  assert.strictEqual(reuseRes.statusCode, 400, 'Reused reset token must be rejected');

  // Restore password hash
  await updateDoc(COLLECTIONS.USERS, studentUserId, { password_hash: testHash });
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
  await setDoc(COLLECTIONS.EMAIL_VERIFICATIONS, hashedVerifyToken, {
    token: hashedVerifyToken,
    email: regStudentEmail,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });

  const verifyRes = createMockRes();
  await verifyEmail({ body: { token: rawVerifyToken } }, verifyRes);
  assert.strictEqual(verifyRes.statusCode, 200);

  const verifyTokenPost = await getDoc(COLLECTIONS.EMAIL_VERIFICATIONS, hashedVerifyToken);
  assert.strictEqual(verifyTokenPost, null, 'Verification token must be deleted after use');
  console.log('✓ PASS: Email verification works securely with token consumption.');

  // 4. Chat Attachment Access Control
  console.log('\n--- Chat Attachment Access Control ---');
  const connId = `conn-test-${Date.now()}`;
  const msgId = `msg-test-${Date.now()}`;

  await setDoc(COLLECTIONS.CONNECTIONS, connId, {
    connection_id: connId,
    user_a: studentUserId,
    user_b: mentorUserId,
    status: 'active',
    created_at: nowISO()
  });

  await setDoc(COLLECTIONS.MESSAGES, msgId, {
    message_id: msgId,
    connection_id: connId,
    sender_id: studentUserId,
    body: 'Private note',
    attachment_url: 'https://example.com/test.pdf',
    attachment_name: 'test.pdf',
    sent_at: nowISO()
  });

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
  await updateDoc(COLLECTIONS.USERS, studentUserId, {
    failed_login_attempts: 0,
    lockout_until: null
  });
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
  console.log(' ALL REGRESSION TESTS PASSED (100% SUCCESS)');
  console.log('====================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});

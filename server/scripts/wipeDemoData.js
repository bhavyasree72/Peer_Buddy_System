require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { query } = require('../src/database/db');

async function wipeDemoData() {
  console.log('--- Wiping Demo and Test Accounts from Database ---');

  // Find users to delete:
  // student@nmims.in, mentor@nmims.in, faculty@nmims.in, admin@nmims.in, test2@nmims.in, and all sec_test_*@nmims.in
  const usersRes = await query(`
    SELECT user_id, email, role FROM users 
    WHERE email IN ('student@nmims.in', 'mentor@nmims.in', 'faculty@nmims.in', 'admin@nmims.in', 'test2@nmims.in')
       OR email LIKE 'sec_test_%@nmims.in'
  `);

  const demoUsers = usersRes.rows;
  console.log(`Found ${demoUsers.length} target accounts to wipe:`, demoUsers.map(u => `${u.email} (${u.user_id})`));

  if (demoUsers.length === 0) {
    console.log('No demo/sec_test accounts found.');
    return;
  }

  for (const user of demoUsers) {
    const uid = user.user_id;

    // Delete messages
    await query(`
      DELETE FROM messages 
      WHERE sender_id = $1 
         OR connection_id IN (
           SELECT connection_id FROM connections WHERE user_a = $1 OR user_b = $1
         )
    `, [uid]);

    // Delete connections
    await query('DELETE FROM connections WHERE user_a = $1 OR user_b = $1', [uid]);

    // Delete requests
    await query('DELETE FROM buddy_requests WHERE sender_id = $1 OR receiver_id = $1', [uid]);

    // Delete sessions
    await query('DELETE FROM study_sessions WHERE organizer_id = $1 OR partner_id = $1', [uid]);

    // Delete reviews
    await query('DELETE FROM reviews WHERE reviewer_id = $1 OR reviewee_id = $1', [uid]);

    // Delete reports
    await query('DELETE FROM reports WHERE reporter_id = $1 OR reported_user_id = $1', [uid]);

    // Delete skills, interests, availability
    await query('DELETE FROM user_skills WHERE user_id = $1', [uid]);
    await query('DELETE FROM user_interests WHERE user_id = $1', [uid]);
    await query('DELETE FROM availability WHERE user_id = $1', [uid]);

    // Delete student & staff profiles
    await query('DELETE FROM student_profiles WHERE user_id = $1', [uid]);
    await query('DELETE FROM staff_profiles WHERE user_id = $1', [uid]);

    // Delete notifications & verifications
    await query('DELETE FROM notifications WHERE user_id = $1', [uid]);
    await query('DELETE FROM email_verifications WHERE email = $1', [user.email]);
    await query('DELETE FROM password_resets WHERE email = $1', [user.email]);

    // Delete user record
    await query('DELETE FROM users WHERE user_id = $1', [uid]);
    console.log(`✓ Deleted account and all related data: ${user.email} (${uid})`);
  }

  console.log('--- Wipe completed successfully. All @gmail.com accounts preserved. ---');
}

if (require.main === module) {
  wipeDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Wipe script failed:', err);
      process.exit(1);
    });
}

module.exports = wipeDemoData;

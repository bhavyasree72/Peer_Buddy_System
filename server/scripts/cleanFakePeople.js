require('dotenv').config({ path: __dirname + '/../.env' });
const { query } = require('../src/database/db');

async function cleanFakePeople() {
  console.log('Finding target fake users to delete...');
  const res = await query(`
    SELECT u.user_id, u.email, u.sap_id, COALESCE(sp.full_name, stp.full_name, 'No Name') as name
    FROM users u
    LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
    LEFT JOIN staff_profiles stp ON u.user_id = stp.user_id
    WHERE u.email = 'student@nmims.in'
       OR u.email = 'mentor@nmims.in'
       OR u.email = 'faculty@nmims.in'
       OR u.email = 'admin@nmims.in'
       OR u.sap_id = '70000000001'
       OR u.sap_id = '71563521533'
       OR u.email LIKE 'profileverif_%'
       OR u.email LIKE 'sec_test_%'
       OR COALESCE(sp.full_name, '') = 'Student Profile Tester'
       OR COALESCE(sp.full_name, '') = 'Aditi Sharma'
  `);

  console.log('Target users found:', res.rows.length);
  console.log(res.rows);

  const userIds = res.rows.map(r => r.user_id);
  if (userIds.length === 0) {
    console.log('No matching users to delete.');
    return;
  }

  for (const uid of userIds) {
    await query('DELETE FROM messages WHERE sender_id = ?', [uid]);
    await query('DELETE FROM session_attendance WHERE user_id = ?', [uid]);
    await query('DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?', [uid, uid]);
    await query('DELETE FROM study_sessions WHERE organizer_id = ? OR partner_id = ?', [uid, uid]);
    await query('DELETE FROM connections WHERE user_a = ? OR user_b = ?', [uid, uid]);
    await query('DELETE FROM mentor_reviews WHERE mentor_id = ? OR request_id IN (SELECT request_id FROM buddy_requests WHERE sender_id = ? OR receiver_id = ?)', [uid, uid, uid]);
    await query('DELETE FROM buddy_requests WHERE sender_id = ? OR receiver_id = ?', [uid, uid]);
    await query('DELETE FROM reports WHERE reporter_id = ? OR reported_user_id = ?', [uid, uid]);
    await query('DELETE FROM notifications WHERE user_id = ?', [uid]);
    await query('DELETE FROM audit_log WHERE actor_id = ?', [uid]);
    await query('DELETE FROM email_verifications WHERE email IN (SELECT email FROM users WHERE user_id = ?)', [uid]);
    await query('DELETE FROM password_resets WHERE email IN (SELECT email FROM users WHERE user_id = ?)', [uid]);
    await query('DELETE FROM user_skills WHERE user_id = ?', [uid]);
    await query('DELETE FROM user_interests WHERE user_id = ?', [uid]);
    await query('DELETE FROM availability WHERE user_id = ?', [uid]);
    await query('DELETE FROM guidance_messages WHERE mentor_id = ? OR target_id = ?', [uid, uid]);
    await query('UPDATE student_profiles SET mentor_id = NULL WHERE mentor_id = ?', [uid]);
    await query('DELETE FROM student_profiles WHERE user_id = ?', [uid]);
    await query('DELETE FROM staff_profiles WHERE user_id = ?', [uid]);
    await query('DELETE FROM users WHERE user_id = ?', [uid]);
    console.log('Deleted user:', uid);
  }

  console.log('Deletion completed.');
}

cleanFakePeople().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

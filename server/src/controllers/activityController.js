const { query } = require('../database/db');

// GET /api/activity/history
// Tabs: Buddies, Sessions, Chats, Feedback received
// Summary tiles: sessions completed this month, total study hours, buddies connected, average rating
async function getActivityHistory(req, res) {
  try {
    const userId = req.user.userId;

    // 1. Buddies Connected
    const buddies = (await query(`
      SELECT c.connection_id, c.created_at, c.status,
             CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END as buddy_id,
             sp.full_name as buddy_name, sp.photo_url as buddy_photo,
             p.name as program_name, sp.semester
      FROM connections c
      JOIN student_profiles sp ON (CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END) = sp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      WHERE (c.user_a = ? OR c.user_b = ?)
      ORDER BY c.created_at DESC
    `, [userId, userId, userId, userId])).rows;

    // 2. Study Sessions
    const sessions = (await query(`
      SELECT s.*,
             org.full_name as organizer_name,
             part.full_name as partner_name,
             sa.attended as my_attendance
      FROM study_sessions s
      JOIN student_profiles org ON s.organizer_id = org.user_id
      JOIN student_profiles part ON s.partner_id = part.user_id
      LEFT JOIN session_attendance sa ON s.session_id = sa.session_id AND sa.user_id = ?
      WHERE s.organizer_id = ? OR s.partner_id = ?
      ORDER BY s.start_at DESC
    `, [userId, userId, userId])).rows;

    // 3. Feedback received
    const feedback = (await query(`
      SELECT r.*, sp.full_name as reviewer_name, s.title as session_title, s.subject
      FROM reviews r
      JOIN student_profiles sp ON r.reviewer_id = sp.user_id
      JOIN study_sessions s ON r.session_id = s.session_id
      WHERE r.reviewee_id = ?
      ORDER BY r.created_at DESC
    `, [userId])).rows;

    // 4. Chat history summary
    const chats = (await query(`
      SELECT c.connection_id, sp.full_name as buddy_name,
             COUNT(m.message_id) as total_messages,
             MAX(m.sent_at) as last_activity
      FROM connections c
      JOIN student_profiles sp ON (CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END) = sp.user_id
      LEFT JOIN messages m ON c.connection_id = m.connection_id
      WHERE c.user_a = ? OR c.user_b = ?
      GROUP BY c.connection_id, sp.full_name
      ORDER BY last_activity DESC NULLS LAST
    `, [userId, userId, userId])).rows;

    // Calculate Summary Tiles:
    // a. Sessions completed this month
    const now = new Date();
    const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const completedThisMonth = sessions.filter(s => s.status === 'completed' && s.start_at >= firstDayMonth).length;

    // b. Total study hours
    let totalMinutes = 0;
    sessions.filter(s => s.status === 'completed' || s.my_attendance === 'yes').forEach(s => {
      const diff = new Date(s.end_at) - new Date(s.start_at);
      if (diff > 0) totalMinutes += (diff / (1000 * 60));
    });
    const totalHours = (totalMinutes / 60).toFixed(1);

    // c. Buddies connected
    const activeBuddiesCount = buddies.filter(b => b.status === 'active').length;

    // d. Average rating
    const avgRating = feedback.length >= 3 
      ? (feedback.reduce((acc, f) => acc + ((f.punctuality + f.helpfulness + f.communication) / 3), 0) / feedback.length).toFixed(1)
      : null;

    return res.json({
      summary: {
        completedThisMonth,
        totalStudyHours: totalHours,
        buddiesConnected: activeBuddiesCount,
        averageRating: avgRating,
        reviewCount: feedback.length
      },
      buddies,
      sessions,
      feedback,
      chats
    });
  } catch (err) {
    console.error('getActivityHistory error:', err);
    return res.status(500).json({ error: 'Failed to fetch activity history.' });
  }
}

module.exports = {
  getActivityHistory
};

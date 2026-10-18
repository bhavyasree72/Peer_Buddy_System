const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');

// Helper to notify user
async function createNotification(userId, type, message, link) {
  try {
    await query(`
      INSERT INTO notifications (notification_id, user_id, type, message, link)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), userId, type, message, link]);
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// POST /api/reviews/submit
// Rules:
// - Available only after session is completed
// - 1 to 5 stars on punctuality, helpfulness, communication
// - Optional comment up to 300 characters
// - One review per person per session
// - Can be edited within 48 hours
async function submitReview(req, res) {
  try {
    const reviewerId = req.user.userId;
    const { sessionId, punctuality, helpfulness, communication, comment } = req.body;

    if (!sessionId || !punctuality || !helpfulness || !communication) {
      return res.status(400).json({ error: 'Session ID and all 3 ratings are required.' });
    }

    if (punctuality < 1 || punctuality > 5 || helpfulness < 1 || helpfulness > 5 || communication < 1 || communication > 5) {
      return res.status(400).json({ error: 'Ratings must be between 1 and 5 stars.' });
    }

    if (comment && comment.length > 300) {
      return res.status(400).json({ error: 'Comment cannot exceed 300 characters.' });
    }

    // Verify session status
    const sessionRes = await query(`
      SELECT * FROM study_sessions WHERE session_id = ?
    `, [sessionId]);

    if (sessionRes.rowCount === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const session = sessionRes.rows[0];
    if (session.status !== 'completed' && new Date(session.end_at) > new Date()) {
      return res.status(400).json({ error: 'Reviews can only be submitted after the study session is marked completed.' });
    }

    // Determine reviewee
    let revieweeId = null;
    if (session.organizer_id === reviewerId) {
      revieweeId = session.partner_id;
    } else if (session.partner_id === reviewerId) {
      revieweeId = session.organizer_id;
    } else {
      return res.status(403).json({ error: 'You were not a participant in this session.' });
    }

    // Check existing review
    const existingRes = await query(`
      SELECT * FROM reviews WHERE session_id = ? AND reviewer_id = ?
    `, [sessionId, reviewerId]);

    if (existingRes.rowCount > 0) {
      const existing = existingRes.rows[0];
      const hoursSince = (new Date() - new Date(existing.created_at)) / (1000 * 60 * 60);
      
      if (hoursSince > 48) {
        return res.status(400).json({ error: 'Reviews can only be edited within 48 hours of submission.' });
      }

      await query(`
        UPDATE reviews 
        SET punctuality = ?, helpfulness = ?, communication = ?, comment = ?, updated_at = datetime('now')
        WHERE review_id = ?
      `, [punctuality, helpfulness, communication, comment ? comment.trim() : null, existing.review_id]);

      return res.json({ message: 'Review updated successfully.' });
    }

    const reviewId = uuidv4();
    await query(`
      INSERT INTO reviews (review_id, session_id, reviewer_id, reviewee_id, punctuality, helpfulness, communication, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [reviewId, sessionId, reviewerId, revieweeId, punctuality, helpfulness, communication, comment ? comment.trim() : null]);

    // Notify reviewee
    const reviewerNameRes = await query('SELECT full_name FROM student_profiles WHERE user_id = ?', [reviewerId]);
    const reviewerName = reviewerNameRes.rows[0] ? reviewerNameRes.rows[0].full_name : 'Your buddy';

    await createNotification(
      revieweeId,
      'new_review',
      `${reviewerName} submitted feedback for your recent study session.`,
      '/profile'
    );

    return res.status(201).json({
      message: 'Thank you! Your feedback has been recorded.',
      reviewId
    });
  } catch (err) {
    console.error('submitReview error:', err);
    return res.status(500).json({ error: 'Failed to submit feedback.' });
  }
}

// POST /api/reports/create
// Rules:
// - Report user or message
// - Mandatory reason (harassment, spam, fake_profile, inappropriate_content, other)
// - Optional description
// - Message report attaches last 20 messages for admin context
async function createReport(req, res) {
  try {
    const reporterId = req.user.userId;
    const { reportedUserId, messageId, connectionId, reason, description } = req.body;

    if (!reportedUserId || !reason) {
      return res.status(400).json({ error: 'Reported user ID and mandatory reason are required.' });
    }

    const validReasons = ['harassment', 'spam', 'fake_profile', 'inappropriate_content', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ error: 'Invalid report reason.' });
    }

    let chatExcerpt = null;
    if (connectionId) {
      const msgs = (await query(`
        SELECT m.sender_id, m.body, m.sent_at, sp.full_name
        FROM messages m
        JOIN student_profiles sp ON m.sender_id = sp.user_id
        WHERE m.connection_id = ?
        ORDER BY m.sent_at DESC
        LIMIT 20
      `, [connectionId])).rows;
      chatExcerpt = JSON.stringify(msgs.reverse());
    }

    const reportId = uuidv4();
    await query(`
      INSERT INTO reports (report_id, reporter_id, reported_user_id, message_id, reason, description, chat_excerpt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Submitted')
    `, [reportId, reporterId, reportedUserId, messageId || null, reason, description ? description.trim() : null, chatExcerpt]);

    // Audit log
    await query(`
      INSERT INTO audit_log (log_id, actor_id, action, target, details)
      VALUES (?, ?, 'REPORT_SUBMITTED', ?, ?)
    `, [uuidv4(), reporterId, reportedUserId, `Reason: ${reason}`]);

    // Response wording from doc: "Thanks, your report has been sent. You can track it under Settings, My reports."
    return res.status(201).json({
      message: 'Thanks, your report has been sent. You can track it under Settings, My reports.',
      reportId
    });
  } catch (err) {
    console.error('createReport error:', err);
    return res.status(500).json({ error: 'Failed to submit report.' });
  }
}

// GET /api/reports/my
async function getMyReports(req, res) {
  try {
    const userId = req.user.userId;
    const reportsRes = await query(`
      SELECT report_id, reason, description, status, action_taken, created_at, updated_at
      FROM reports
      WHERE reporter_id = ?
      ORDER BY created_at DESC
    `, [userId]);

    return res.json({ reports: reportsRes.rows });
  } catch (err) {
    console.error('getMyReports error:', err);
    return res.status(500).json({ error: 'Failed to fetch your reports.' });
  }
}

module.exports = {
  submitReview,
  createReport,
  getMyReports
};

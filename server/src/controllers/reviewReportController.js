const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  getDoc,
  setDoc,
  updateDoc,
  queryDocs,
  nowISO
} = require('../database/firestoreDb');

// Helper to notify user
async function createNotification(userId, type, message, link) {
  try {
    const id = uuidv4();
    await setDoc(COLLECTIONS.NOTIFICATIONS, id, {
      notification_id: id,
      user_id: userId,
      type,
      message,
      link,
      is_read: 0,
      created_at: nowISO()
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// POST /api/reviews/submit
async function submitReview(req, res) {
  try {
    const reviewerId = req.user.userId;
    const { sessionId, punctuality, helpfulness, communication, comment } = req.body;

    if (!sessionId || !punctuality || !helpfulness || !communication) {
      return res.status(400).json({ error: 'Session ID and all 3 ratings are required.' });
    }

    const p = Number(punctuality);
    const h = Number(helpfulness);
    const c = Number(communication);

    if (p < 1 || p > 5 || h < 1 || h > 5 || c < 1 || c > 5) {
      return res.status(400).json({ error: 'Ratings must be between 1 and 5 stars.' });
    }

    if (comment && comment.length > 300) {
      return res.status(400).json({ error: 'Comment cannot exceed 300 characters.' });
    }

    const session = await getDoc(COLLECTIONS.STUDY_SESSIONS, sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (session.status !== 'completed' && new Date(session.end_at) > new Date()) {
      return res.status(400).json({ error: 'Reviews can only be submitted after the study session is marked completed.' });
    }

    let revieweeId = null;
    if (session.organizer_id === reviewerId) {
      revieweeId = session.partner_id;
    } else if (session.partner_id === reviewerId) {
      revieweeId = session.organizer_id;
    } else {
      return res.status(403).json({ error: 'You were not a participant in this session.' });
    }

    const existingReviews = await queryDocs(COLLECTIONS.REVIEWS, [
      ['session_id', '==', sessionId],
      ['reviewer_id', '==', reviewerId]
    ]);

    if (existingReviews.length > 0) {
      const existing = existingReviews[0];
      const hoursSince = (new Date() - new Date(existing.created_at)) / (1000 * 60 * 60);

      if (hoursSince > 48) {
        return res.status(400).json({ error: 'Reviews can only be edited within 48 hours of submission.' });
      }

      const reviewDocId = existing.review_id || existing.id;
      await updateDoc(COLLECTIONS.REVIEWS, reviewDocId, {
        punctuality: p,
        helpfulness: h,
        communication: c,
        comment: comment ? comment.trim() : null,
        updated_at: nowISO()
      });

      return res.json({ message: 'Review updated successfully.' });
    }

    const reviewId = uuidv4();
    await setDoc(COLLECTIONS.REVIEWS, reviewId, {
      review_id: reviewId,
      session_id: sessionId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      punctuality: p,
      helpfulness: h,
      communication: c,
      comment: comment ? comment.trim() : null,
      created_at: nowISO()
    });

    const reviewerProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, reviewerId);
    const reviewerName = reviewerProf ? reviewerProf.full_name : 'Your buddy';

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
      const msgs = await queryDocs(COLLECTIONS.MESSAGES, [['connection_id', '==', connectionId]]);
      msgs.sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0));
      const last20 = msgs.slice(0, 20);

      const enriched = [];
      for (const m of last20) {
        const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, m.sender_id);
        enriched.push({
          sender_id: m.sender_id,
          body: m.body,
          sent_at: m.sent_at,
          full_name: sp ? sp.full_name : 'User'
        });
      }
      chatExcerpt = JSON.stringify(enriched.reverse());
    }

    const reportId = uuidv4();
    const now = nowISO();

    await setDoc(COLLECTIONS.REPORTS, reportId, {
      report_id: reportId,
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      message_id: messageId || null,
      reason,
      description: description ? description.trim() : null,
      chat_excerpt: chatExcerpt,
      status: 'Submitted',
      created_at: now
    });

    // Audit log
    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: reporterId,
      action: 'REPORT_SUBMITTED',
      target: reportedUserId,
      details: `Reason: ${reason}`,
      created_at: now
    });

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
    const reports = await queryDocs(COLLECTIONS.REPORTS, [['reporter_id', '==', userId]]);
    reports.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return res.json({ reports });
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

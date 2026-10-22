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

// POST /api/sessions/propose
async function proposeSession(req, res) {
  try {
    const organizerId = req.user.userId;
    const { partnerId, connectionId, title, subject, startAt, endAt, mode, locationOrLink, department, semester } = req.body;

    if (!partnerId || !title || !subject || !startAt || !endAt || !mode || !locationOrLink) {
      return res.status(400).json({ error: 'All session fields are required.' });
    }

    if (new Date(startAt) >= new Date(endAt)) {
      return res.status(400).json({ error: 'Session start time must be before end time.' });
    }

    // Check conflict for organizer or partner
    // Wording from doc: "You already have a session at this time. Pick another slot?"
    const conflictRes = await query(`
      SELECT session_id FROM study_sessions
      WHERE (organizer_id = ? OR partner_id = ? OR organizer_id = ? OR partner_id = ?)
        AND status IN ('proposed', 'confirmed')
        AND (
          (start_at < ? AND end_at > ?) OR
          (start_at >= ? AND start_at < ?)
        )
    `, [organizerId, organizerId, partnerId, partnerId, endAt, startAt, startAt, endAt]);

    if (conflictRes.rowCount > 0) {
      return res.status(409).json({ error: 'You already have a session at this time. Pick another slot?' });
    }

    const sessionId = uuidv4();
    await query(`
      INSERT INTO study_sessions 
      (session_id, connection_id, organizer_id, partner_id, title, subject, start_at, end_at, mode, location_or_link, status, department, semester)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)
    `, [sessionId, connectionId || null, organizerId, partnerId, title.trim(), subject.trim(), startAt, endAt, mode, locationOrLink.trim(), department || null, semester || 1]);

    const organizerNameRes = await query('SELECT full_name FROM student_profiles WHERE user_id = ?', [organizerId]);
    const orgName = organizerNameRes.rows[0] ? organizerNameRes.rows[0].full_name : 'Your buddy';

    // Notify partner
    await createNotification(
      partnerId,
      'session_invitation',
      `${orgName} invited you to a study session: "${title}".`,
      '/sessions'
    );

    return res.status(201).json({
      message: 'Study session proposed successfully.',
      sessionId
    });
  } catch (err) {
    console.error('proposeSession error:', err);
    return res.status(500).json({ error: 'Failed to propose session.' });
  }
}

// POST /api/sessions/:sessionId/respond
async function respondSession(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { action, suggestedStartAt, suggestedEndAt } = req.body; // 'accept', 'decline', 'suggest_new_time'

    const sessionRes = await query(`
      SELECT s.*, sp.full_name as partner_name
      FROM study_sessions s
      JOIN student_profiles sp ON s.partner_id = sp.user_id
      WHERE s.session_id = ? AND s.partner_id = ? AND s.status = 'proposed'
    `, [sessionId, userId]);

    if (sessionRes.rowCount === 0) {
      return res.status(404).json({ error: 'Proposed session not found.' });
    }

    const session = sessionRes.rows[0];

    if (action === 'accept') {
      await query(`UPDATE study_sessions SET status = 'confirmed' WHERE session_id = ?`, [sessionId]);

      await createNotification(
        session.organizer_id,
        'session_accepted',
        `${session.partner_name} accepted the study session "${session.title}".`,
        '/sessions'
      );

      return res.json({ message: 'Session confirmed and added to calendar.' });
    } else if (action === 'decline') {
      await query(`UPDATE study_sessions SET status = 'declined' WHERE session_id = ?`, [sessionId]);

      await createNotification(
        session.organizer_id,
        'session_declined',
        `${session.partner_name} declined the study session "${session.title}".`,
        '/sessions'
      );

      return res.json({ message: 'Session declined.' });
    } else if (action === 'suggest_new_time') {
      if (!suggestedStartAt || !suggestedEndAt) {
        return res.status(400).json({ error: 'Please specify the suggested new time.' });
      }

      await query(`
        UPDATE study_sessions 
        SET start_at = ?, end_at = ?, status = 'proposed', organizer_id = ?, partner_id = ?
        WHERE session_id = ?
      `, [suggestedStartAt, suggestedEndAt, userId, session.organizer_id, sessionId]);

      await createNotification(
        session.organizer_id,
        'session_time_suggested',
        `${session.partner_name} suggested a new time for "${session.title}".`,
        '/sessions'
      );

      return res.json({ message: 'New time suggested to your buddy.' });
    } else {
      return res.status(400).json({ error: 'Invalid action.' });
    }
  } catch (err) {
    console.error('respondSession error:', err);
    return res.status(500).json({ error: 'Failed to process session response.' });
  }
}

// POST /api/sessions/:sessionId/attendance
async function markAttendance(req, res) {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;
    const { attended } = req.body; // 'yes' or 'no'

    if (!['yes', 'no'].includes(attended)) {
      return res.status(400).json({ error: 'Attendance must be yes or no.' });
    }

    const sessionRes = await query(`
      SELECT * FROM study_sessions 
      WHERE session_id = ? AND (organizer_id = ? OR partner_id = ?)
    `, [sessionId, userId, userId]);

    if (sessionRes.rowCount === 0) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    const session = sessionRes.rows[0];

    // Check if session end_at has passed
    if (new Date(session.end_at) > new Date()) {
      return res.status(400).json({ error: 'Attendance can only be marked after the session end time.' });
    }

    // Upsert attendance record
    const existingAtt = await query(`
      SELECT id FROM session_attendance WHERE session_id = ? AND user_id = ?
    `, [sessionId, userId]);

    if (existingAtt.rowCount > 0) {
      await query(`
        UPDATE session_attendance SET attended = ?, marked_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND user_id = ?
      `, [attended, sessionId, userId]);
    } else {
      await query(`
        INSERT INTO session_attendance (id, session_id, user_id, attended)
        VALUES (?, ?, ?, ?)
      `, [uuidv4(), sessionId, userId, attended]);
    }

    // Dual Confirmation: Record confirmation for participant (Issue 13)
    const isOrganizer = session.organizer_id === userId;
    const confirmedVal = attended === 'yes' ? 1 : 0;

    if (isOrganizer) {
      await query(`UPDATE study_sessions SET confirmed_by_organizer = ? WHERE session_id = ?`, [confirmedVal, sessionId]);
    } else {
      await query(`UPDATE study_sessions SET confirmed_by_partner = ? WHERE session_id = ?`, [confirmedVal, sessionId]);
    }

    // Check if both confirmed (2/2 verification)
    const updatedSession = (await query(`SELECT confirmed_by_organizer, confirmed_by_partner FROM study_sessions WHERE session_id = ?`, [sessionId])).rows[0];
    const isBothConfirmed = updatedSession && updatedSession.confirmed_by_organizer === 1 && updatedSession.confirmed_by_partner === 1;

    if (isBothConfirmed) {
      await query(`UPDATE study_sessions SET is_verified = 1, status = 'completed' WHERE session_id = ?`, [sessionId]);
    }

    return res.json({
      message: 'Attendance recorded successfully.',
      verified: isBothConfirmed,
      verificationCount: (updatedSession?.confirmed_by_organizer || 0) + (updatedSession?.confirmed_by_partner || 0)
    });
  } catch (err) {
    console.error('markAttendance error:', err);
    return res.status(500).json({ error: 'Failed to record attendance.' });
  }
}

// GET /api/sessions
async function getSessions(req, res) {
  try {
    const userId = req.user.userId;

    const sessionsRes = await query(`
      SELECT s.*,
             org.full_name as organizer_name, org.photo_url as organizer_photo,
             part.full_name as partner_name, part.photo_url as partner_photo,
             (
               SELECT attended FROM session_attendance 
               WHERE session_id = s.session_id AND user_id = ?
             ) as my_attendance,
             (
               SELECT review_id FROM reviews 
               WHERE session_id = s.session_id AND reviewer_id = ?
             ) as my_review_id
      FROM study_sessions s
      JOIN student_profiles org ON s.organizer_id = org.user_id
      JOIN student_profiles part ON s.partner_id = part.user_id
      WHERE s.organizer_id = ? OR s.partner_id = ?
      ORDER BY s.start_at ASC
    `, [userId, userId, userId, userId]);

    return res.json({ sessions: sessionsRes.rows });
  } catch (err) {
    console.error('getSessions error:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions.' });
  }
}

module.exports = {
  proposeSession,
  respondSession,
  markAttendance,
  getSessions
};

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

// POST /api/requests/send
// Rules from doc:
// - Note up to 200 characters
// - No duplicate pending request to the same person
// - No request to self
// - Maximum 10 pending outgoing requests
// - Mentor review flagging: sender reported before OR first-year with much senior student OR review_all_requests switch
async function sendRequest(req, res) {
  try {
    const senderId = req.user.userId;
    const { receiverId, note } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'Receiver user ID is required.' });
    }

    if (senderId === receiverId) {
      return res.status(400).json({ error: 'You cannot send a buddy request to yourself.' });
    }

    if (note && note.length > 200) {
      return res.status(400).json({ error: 'Note must be at most 200 characters.' });
    }

    // Check receiver exists and is active student
    const receiverRes = await query(`
      SELECT u.user_id, u.status, sp.full_name, sp.semester, sp.year, sp.open_to_requests
      FROM users u
      JOIN student_profiles sp ON u.user_id = sp.user_id
      WHERE u.user_id = ?
    `, [receiverId]);

    if (receiverRes.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const receiver = receiverRes.rows[0];
    if (receiver.open_to_requests === 0) {
      return res.status(400).json({ error: 'This student is currently not open to new buddy requests.' });
    }

    // Check if already connected
    const connCheck = await query(`
      SELECT connection_id FROM connections
      WHERE ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)) AND status = 'active'
    `, [senderId, receiverId, receiverId, senderId]);

    if (connCheck.rowCount > 0) {
      return res.status(400).json({ error: 'You are already connected with this student.' });
    }

    // Check duplicate pending request
    const dupCheck = await query(`
      SELECT request_id FROM buddy_requests
      WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
    `, [senderId, receiverId]);

    if (dupCheck.rowCount > 0) {
      return res.status(400).json({ error: 'You already have a pending request to this student.' });
    }

    // Check maximum 10 pending outgoing requests
    const outgoingCountRes = await query(`
      SELECT COUNT(*) as count FROM buddy_requests
      WHERE sender_id = ? AND status = 'pending'
    `, [senderId]);
    const outgoingCount = outgoingCountRes.rows[0].count;

    if (outgoingCount >= 10) {
      return res.status(400).json({ error: 'You have reached the maximum limit of 10 pending buddy requests. Please wait for responses or cancel older requests.' });
    }

    // Check mentor review criteria:
    // 1. Sender has been reported before
    const reportCheck = await query('SELECT COUNT(*) as c FROM reports WHERE reported_user_id = ?', [senderId]);
    const wasReported = reportCheck.rows[0].c > 0;

    // 2. First-year matched with senior student (e.g., year 1 vs year 3 or 4)
    const senderProf = (await query('SELECT semester, year FROM student_profiles WHERE user_id = ?', [senderId])).rows[0] || {};
    const isYearGap = (senderProf.year === 1 && receiver.year >= 3) || (receiver.year === 1 && senderProf.year >= 3);

    // 3. Admin review_all_requests setting
    const reviewSetting = (await query('SELECT value FROM settings WHERE key = "review_all_requests"')).rows[0];
    const reviewAll = reviewSetting && reviewSetting.value === '1';

    const needsMentorReview = (wasReported || isYearGap || reviewAll) ? 1 : 0;

    const requestId = uuidv4();
    await query(`
      INSERT INTO buddy_requests (request_id, sender_id, receiver_id, note, status, needs_mentor_review)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `, [requestId, senderId, receiverId, note ? note.trim() : null, needsMentorReview]);

    const senderNameRes = await query('SELECT full_name FROM student_profiles WHERE user_id = ?', [senderId]);
    const senderName = senderNameRes.rows[0] ? senderNameRes.rows[0].full_name : 'A student';

    // Notification to receiver
    await createNotification(
      receiverId,
      'new_request',
      `${senderName} sent you a buddy request.`,
      '/buddies?tab=received'
    );

    // Polite message wording from doc: "Request sent to Aditi. We will let you know when she responds."
    const receiverFirstName = receiver.full_name ? receiver.full_name.split(' ')[0] : 'the student';
    return res.status(201).json({
      message: `Request sent to ${receiverFirstName}. We will let you know when they respond.`,
      requestId,
      needsMentorReview: !!needsMentorReview
    });
  } catch (err) {
    console.error('sendRequest error:', err);
    return res.status(500).json({ error: 'Failed to send buddy request.' });
  }
}

// POST /api/requests/:requestId/respond
async function respondToRequest(req, res) {
  try {
    const userId = req.user.userId;
    const { requestId } = req.params;
    const { action } = req.body; // 'accept' or 'decline'

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or decline.' });
    }

    const reqRes = await query(`
      SELECT br.*, sp.full_name as receiver_name
      FROM buddy_requests br
      JOIN student_profiles sp ON br.receiver_id = sp.user_id
      WHERE br.request_id = ? AND br.receiver_id = ? AND br.status = 'pending'
    `, [requestId, userId]);

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Pending request not found.' });
    }

    const request = reqRes.rows[0];

    if (action === 'accept') {
      await query(`
        UPDATE buddy_requests
        SET status = 'accepted', responded_at = datetime('now')
        WHERE request_id = ?
      `, [requestId]);

      // Create connection
      const connectionId = uuidv4();
      await query(`
        INSERT INTO connections (connection_id, user_a, user_b, status)
        VALUES (?, ?, ?, 'active')
      `, [connectionId, request.sender_id, request.receiver_id]);

      // Notify sender
      await createNotification(
        request.sender_id,
        'request_accepted',
        `${request.receiver_name} accepted your buddy request! Chat is now open.`,
        `/chat?connectionId=${connectionId}`
      );

      return res.json({
        message: 'Buddy request accepted. You can now chat and schedule study sessions.',
        connectionId
      });
    } else {
      await query(`
        UPDATE buddy_requests
        SET status = 'declined', responded_at = datetime('now')
        WHERE request_id = ?
      `, [requestId]);

      // Polite wording from doc: "Your request was not accepted this time. You can look for other buddies."
      await createNotification(
        request.sender_id,
        'request_declined',
        'Your request was not accepted this time. You can look for other buddies.',
        '/find-buddies'
      );

      return res.json({ message: 'Request declined.' });
    }
  } catch (err) {
    console.error('respondToRequest error:', err);
    return res.status(500).json({ error: 'Failed to respond to request.' });
  }
}

// POST /api/requests/:requestId/cancel
async function cancelRequest(req, res) {
  try {
    const userId = req.user.userId;
    const { requestId } = req.params;

    const reqRes = await query(`
      SELECT * FROM buddy_requests
      WHERE request_id = ? AND sender_id = ? AND status = 'pending'
    `, [requestId, userId]);

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Pending request not found.' });
    }

    await query(`
      UPDATE buddy_requests SET status = 'cancelled', responded_at = datetime('now')
      WHERE request_id = ?
    `, [requestId]);

    return res.json({ message: 'Request cancelled.' });
  } catch (err) {
    console.error('cancelRequest error:', err);
    return res.status(500).json({ error: 'Failed to cancel request.' });
  }
}

// GET /api/requests
async function getRequests(req, res) {
  try {
    const userId = req.user.userId;

    // Received requests
    const receivedRes = await query(`
      SELECT br.*, sp.full_name as sender_name, sp.photo_url, sp.semester,
             p.name as program_name, s.name as school_name
      FROM buddy_requests br
      JOIN student_profiles sp ON br.sender_id = sp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      LEFT JOIN schools s ON sp.school_id = s.id
      WHERE br.receiver_id = ? AND br.status = 'pending'
      ORDER BY br.created_at DESC
    `, [userId]);

    // Sent requests
    const sentRes = await query(`
      SELECT br.*, sp.full_name as receiver_name, sp.photo_url, sp.semester,
             p.name as program_name, s.name as school_name
      FROM buddy_requests br
      JOIN student_profiles sp ON br.receiver_id = sp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      LEFT JOIN schools s ON sp.school_id = s.id
      WHERE br.sender_id = ? AND br.status = 'pending'
      ORDER BY br.created_at DESC
    `, [userId]);

    // Active Connected Buddies
    const connectionsRes = await query(`
      SELECT c.connection_id, c.created_at,
             CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END as buddy_id,
             sp.full_name, sp.photo_url, sp.semester, p.name as program_name, s.name as school_name,
             u.email, sp.show_email
      FROM connections c
      JOIN users u ON (CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END) = u.user_id
      JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      LEFT JOIN schools s ON sp.school_id = s.id
      WHERE (c.user_a = ? OR c.user_b = ?) AND c.status = 'active'
      ORDER BY c.created_at DESC
    `, [userId, userId, userId, userId]);

    return res.json({
      received: receivedRes.rows,
      sent: sentRes.rows,
      buddies: connectionsRes.rows
    });
  } catch (err) {
    console.error('getRequests error:', err);
    return res.status(500).json({ error: 'Failed to fetch buddy requests.' });
  }
}

// POST /api/requests/disconnect/:connectionId
async function disconnectBuddy(req, res) {
  try {
    const userId = req.user.userId;
    const { connectionId } = req.params;

    const connRes = await query(`
      SELECT * FROM connections
      WHERE connection_id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'
    `, [connectionId, userId, userId]);

    if (connRes.rowCount === 0) {
      return res.status(404).json({ error: 'Active connection not found.' });
    }

    const conn = connRes.rows[0];
    const otherUserId = conn.user_a === userId ? conn.user_b : conn.user_a;

    await query(`
      UPDATE connections SET status = 'ended', ended_at = datetime('now')
      WHERE connection_id = ?
    `, [connectionId]);

    const senderProf = await query('SELECT full_name FROM student_profiles WHERE user_id = ?', [userId]);
    const senderName = senderProf.rows[0] ? senderProf.rows[0].full_name : 'Your buddy';

    // Notify the other user as required by doc
    await createNotification(
      otherUserId,
      'connection_ended',
      `${senderName} ended the buddy connection.`,
      '/buddies'
    );

    return res.json({ message: 'Buddy connection ended.' });
  } catch (err) {
    console.error('disconnectBuddy error:', err);
    return res.status(500).json({ error: 'Failed to end buddy connection.' });
  }
}

module.exports = {
  sendRequest,
  respondToRequest,
  cancelRequest,
  getRequests,
  disconnectBuddy
};

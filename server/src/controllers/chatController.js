const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');

// GET /api/chat/conversations
async function getConversations(req, res) {
  try {
    const userId = req.user.userId;

    const connectionsRes = await query(`
      SELECT c.connection_id, c.created_at,
             CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END as buddy_id,
             COALESCE(sp.full_name, stp.full_name, u.email, 'NMIMS User') as buddy_name,
             COALESCE(sp.photo_url, stp.photo_url) as buddy_photo,
             u.role as buddy_role,
             (
               SELECT body FROM messages 
               WHERE connection_id = c.connection_id 
               ORDER BY sent_at DESC LIMIT 1
             ) as last_message,
             (
               SELECT sent_at FROM messages 
               WHERE connection_id = c.connection_id 
               ORDER BY sent_at DESC LIMIT 1
             ) as last_message_at,
             (
               SELECT COUNT(*) FROM messages 
               WHERE connection_id = c.connection_id 
                 AND sender_id != ? 
                 AND status != 'read'
             ) as unread_count
      FROM connections c
      JOIN users u ON (CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END) = u.user_id
      LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN staff_profiles stp ON u.user_id = stp.user_id
      WHERE (c.user_a = ? OR c.user_b = ?) AND c.status = 'active'
      ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
    `, [userId, userId, userId, userId, userId]);

    return res.json({ conversations: connectionsRes.rows });
  } catch (err) {
    console.error('getConversations error:', err);
    return res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
}

// GET /api/chat/messages/:connectionId
async function getMessages(req, res) {
  try {
    const userId = req.user.userId;
    const { connectionId } = req.params;

    // Verify user is an authorized participant in connection
    const connCheck = await query(`
      SELECT * FROM connections 
      WHERE connection_id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'
    `, [connectionId, userId, userId]);

    if (connCheck.rowCount === 0) {
      return res.status(403).json({ error: 'Access denied: You are not an authorized participant in this private conversation.' });
    }

    const messagesRes = await query(`
      SELECT m.*, COALESCE(sp.full_name, stp.full_name, u.email, 'NMIMS User') as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.user_id
      LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN staff_profiles stp ON u.user_id = stp.user_id
      WHERE m.connection_id = ?
      ORDER BY m.sent_at ASC
    `, [connectionId]);

    // Mark received messages as read
    await query(`
      UPDATE messages 
      SET status = 'read' 
      WHERE connection_id = ? AND sender_id != ? AND status != 'read'
    `, [connectionId, userId]);

    return res.json({ messages: messagesRes.rows });
  } catch (err) {
    console.error('getMessages error:', err);
    return res.status(500).json({ error: 'Failed to load messages.' });
  }
}

// POST /api/chat/send
async function sendMessage(req, res) {
  try {
    const senderId = req.user.userId;
    const { connectionId, body } = req.body;

    if (!connectionId) {
      return res.status(400).json({ error: 'Connection ID is required.' });
    }

    if (!body && !req.file) {
      return res.status(400).json({ error: 'Message body or attachment required.' });
    }

    if (body && body.length > 1000) {
      return res.status(400).json({ error: 'Message cannot exceed 1000 characters.' });
    }

    // Verify membership
    const connCheck = await query(`
      SELECT * FROM connections 
      WHERE connection_id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'
    `, [connectionId, senderId, senderId]);

    if (connCheck.rowCount === 0) {
      return res.status(403).json({ error: 'Connection not found or inactive.' });
    }

    const messageId = uuidv4();
    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentType = null;

    if (req.file) {
      attachmentUrl = `/uploads/${req.file.filename}`;
      attachmentName = req.file.originalname;
      attachmentType = req.file.mimetype;
    }

    await query(`
      INSERT INTO messages (message_id, connection_id, sender_id, body, attachment_url, attachment_name, attachment_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')
    `, [messageId, connectionId, senderId, body ? body.trim() : '', attachmentUrl, attachmentName, attachmentType]);

    const createdMsg = (await query('SELECT * FROM messages WHERE message_id = ?', [messageId])).rows[0];

    return res.status(201).json({
      message: 'Message sent',
      chatMessage: createdMsg
    });
  } catch (err) {
    console.error('sendMessage error:', err);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
}

// GET /api/chat/attachments/:messageId
// CHANGE 3: Secure authorized download access to chat attachments
async function downloadAttachment(req, res) {
  try {
    const userId = req.user.userId;
    const { messageId } = req.params;

    const msgRes = await query('SELECT * FROM messages WHERE message_id = ?', [messageId]);
    if (msgRes.rowCount === 0) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }

    const msg = msgRes.rows[0];
    if (!msg.attachment_url) {
      return res.status(404).json({ error: 'No attachment for this message.' });
    }

    // Verify requesting user is a participant of the connection
    const connRes = await query(
      'SELECT * FROM connections WHERE connection_id = ? AND (user_a = ? OR user_b = ?)',
      [msg.connection_id, userId, userId]
    );

    if (connRes.rowCount === 0 && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view this attachment.' });
    }

    // Safe path resolution preventing directory traversal
    const path = require('path');
    const fs = require('fs');
    const filename = path.basename(msg.attachment_url);
    const filePath = path.resolve(__dirname, '../../../uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server.' });
    }

    return res.download(filePath, msg.attachment_name || filename);
  } catch (err) {
    console.error('downloadAttachment error:', err);
    return res.status(500).json({ error: 'Failed to download attachment.' });
  }
}

// POST /api/chat/start-direct
// Allows an authorized student to initiate a 1-to-1 conversation with an assigned mentor or faculty member
async function startDirectConversation(req, res) {
  try {
    const senderId = req.user.userId;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required.' });
    }

    if (senderId === targetUserId) {
      return res.status(400).json({ error: 'Cannot initiate a conversation with yourself.' });
    }

    // Verify target user exists and is active
    const targetRes = await query('SELECT user_id, role, status FROM users WHERE user_id = ? AND status = "active"', [targetUserId]);
    if (targetRes.rowCount === 0) {
      return res.status(404).json({ error: 'Target user not found or inactive.' });
    }

    // Check if an active connection already exists
    const existingConn = await query(`
      SELECT connection_id FROM connections
      WHERE ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)) AND status = 'active'
    `, [senderId, targetUserId, targetUserId, senderId]);

    if (existingConn.rowCount > 0) {
      return res.json({
        message: 'Conversation already exists.',
        connectionId: existingConn.rows[0].connection_id
      });
    }

    const connectionId = uuidv4();
    await query(`
      INSERT INTO connections (connection_id, user_a, user_b, status)
      VALUES (?, ?, ?, 'active')
    `, [connectionId, senderId, targetUserId]);

    return res.status(201).json({
      message: 'Private conversation opened.',
      connectionId
    });
  } catch (err) {
    console.error('startDirectConversation error:', err);
    return res.status(500).json({ error: 'Failed to initiate conversation.' });
  }
}

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
  downloadAttachment,
  startDirectConversation
};


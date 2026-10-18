const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');

// GET /api/chat/conversations
async function getConversations(req, res) {
  try {
    const userId = req.user.userId;

    const connectionsRes = await query(`
      SELECT c.connection_id, c.created_at,
             CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END as buddy_id,
             sp.full_name as buddy_name, sp.photo_url as buddy_photo,
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
      JOIN student_profiles sp ON (CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END) = sp.user_id
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

    // Verify user is in connection
    const connCheck = await query(`
      SELECT * FROM connections 
      WHERE connection_id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'
    `, [connectionId, userId, userId]);

    if (connCheck.rowCount === 0) {
      return res.status(403).json({ error: 'Access denied or connection not active.' });
    }

    const messagesRes = await query(`
      SELECT m.*, sp.full_name as sender_name
      FROM messages m
      JOIN student_profiles sp ON m.sender_id = sp.user_id
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

module.exports = {
  getConversations,
  getMessages,
  sendMessage
};

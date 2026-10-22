const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');
const { JWT_SECRET } = require('../middleware/auth');

// Track online users: userId -> Set of socket IDs
const onlineUsers = new Map();

function setupSocket(io) {
  // Authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.userId;

    // Track presence
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Broadcast user online status
    io.emit('user_presence', { userId, status: 'online' });

    // Join a connection room with server-side authorization check
    socket.on('join_room', async ({ connectionId }) => {
      try {
        const connCheck = await query(`
          SELECT connection_id FROM connections
          WHERE connection_id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'
        `, [connectionId, userId, userId]);

        if (connCheck.rowCount > 0) {
          socket.join(connectionId);
        } else {
          socket.emit('error', { message: 'Unauthorized room access' });
        }
      } catch (err) {
        console.error('Socket join_room error:', err);
      }
    });

    // Leave a connection room
    socket.on('leave_room', ({ connectionId }) => {
      socket.leave(connectionId);
    });

    // Typing indicators
    socket.on('typing_start', ({ connectionId, buddyId }) => {
      socket.to(connectionId).emit('typing_start', { connectionId, userId });
    });

    socket.on('typing_stop', ({ connectionId, buddyId }) => {
      socket.to(connectionId).emit('typing_stop', { connectionId, userId });
    });

    // Real-time message sending
    socket.on('send_message', async ({ connectionId, body, attachmentUrl, attachmentName, attachmentType }) => {
      try {
        // Enforce membership check
        const connCheck = await query(`
          SELECT connection_id FROM connections
          WHERE connection_id = ? AND (user_a = ? OR user_b = ?) AND status = 'active'
        `, [connectionId, userId, userId]);

        if (connCheck.rowCount === 0) {
          return socket.emit('error', { message: 'Unauthorized: cannot send message to this conversation.' });
        }

        const messageId = uuidv4();
        await query(`
          INSERT INTO messages (message_id, connection_id, sender_id, body, attachment_url, attachment_name, attachment_type, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')
        `, [messageId, connectionId, userId, body || '', attachmentUrl || null, attachmentName || null, attachmentType || null]);

        const senderRes = await query(`
          SELECT COALESCE(sp.full_name, stp.full_name, u.email, 'NMIMS User') as full_name
          FROM users u
          LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
          LEFT JOIN staff_profiles stp ON u.user_id = stp.user_id
          WHERE u.user_id = ?
        `, [userId]);
        const senderName = senderRes.rows[0] ? senderRes.rows[0].full_name : 'NMIMS User';

        const newMsg = {
          message_id: messageId,
          connection_id: connectionId,
          sender_id: userId,
          sender_name: senderName,
          body,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          attachment_type: attachmentType,
          status: 'sent',
          sent_at: new Date().toISOString()
        };

        // Broadcast to room
        io.to(connectionId).emit('new_message', newMsg);
      } catch (err) {
        console.error('Socket send_message error:', err);
      }
    });

    // Message read receipt
    socket.on('mark_read', async ({ connectionId }) => {
      try {
        await query(`
          UPDATE messages SET status = 'read'
          WHERE connection_id = ? AND sender_id != ? AND status != 'read'
        `, [connectionId, userId]);

        socket.to(connectionId).emit('messages_read', { connectionId, readerId: userId });
      } catch (err) {
        console.error('Socket mark_read error:', err);
      }
    });

    // Query presence
    socket.on('check_online', ({ userIds }, callback) => {
      if (typeof callback === 'function') {
        const result = {};
        if (Array.isArray(userIds)) {
          userIds.forEach(uid => {
            result[uid] = onlineUsers.has(uid) && onlineUsers.get(uid).size > 0;
          });
        }
        callback(result);
      }
    });

    socket.on('disconnect', () => {
      if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socket.id);
        if (onlineUsers.get(userId).size === 0) {
          onlineUsers.delete(userId);
          io.emit('user_presence', { userId, status: 'offline' });
        }
      }
    });
  });
}

module.exports = {
  setupSocket,
  onlineUsers
};

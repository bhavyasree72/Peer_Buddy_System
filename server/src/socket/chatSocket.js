const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  getDoc,
  queryDocs,
  updateDoc,
  getBatch,
  nowISO
} = require('../database/firestoreDb');
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
        const conn = await getDoc(COLLECTIONS.CONNECTIONS, connectionId);
        if (conn && (conn.user_a === userId || conn.user_b === userId) && conn.status === 'active') {
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
    socket.on('typing_start', ({ connectionId }) => {
      socket.to(connectionId).emit('typing_start', { connectionId, userId });
    });

    socket.on('typing_stop', ({ connectionId }) => {
      socket.to(connectionId).emit('typing_stop', { connectionId, userId });
    });

    // Real-time message broadcasting (row is already saved via POST /api/chat/send)
    socket.on('send_message', async ({ connectionId, body, attachmentUrl, attachmentName, attachmentType, messageId: clientMsgId, sentAt }) => {
      try {
        const conn = await getDoc(COLLECTIONS.CONNECTIONS, connectionId);
        if (!conn || (conn.user_a !== userId && conn.user_b !== userId) || conn.status !== 'active') {
          return socket.emit('error', { message: 'Unauthorized: cannot send message to this conversation.' });
        }

        const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, userId);
        const stp = await getDoc(COLLECTIONS.STAFF_PROFILES, userId);
        const userDoc = await getDoc(COLLECTIONS.USERS, userId);
        const senderName = (sp && sp.full_name) || (stp && stp.full_name) || (userDoc && userDoc.email) || 'NMIMS User';

        const newMsg = {
          message_id: clientMsgId || uuidv4(),
          connection_id: connectionId,
          sender_id: userId,
          sender_name: senderName,
          body,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          attachment_type: attachmentType,
          status: 'sent',
          sent_at: sentAt || nowISO()
        };

        // Broadcast to all sockets in the conversation room except sender
        socket.to(connectionId).emit('new_message', newMsg);
      } catch (err) {
        console.error('Socket send_message error:', err);
      }
    });

    // Message read receipt
    socket.on('mark_read', async ({ connectionId }) => {
      try {
        const msgs = await queryDocs(COLLECTIONS.MESSAGES, [
          ['connection_id', '==', connectionId]
        ]);
        const unread = msgs.filter(m => m.sender_id !== userId && m.status !== 'read');

        if (unread.length > 0) {
          const batch = getBatch();
          const { collection } = require('../database/firestoreDb');
          unread.forEach(m => {
            const mId = m.message_id || m.id;
            batch.update(collection(COLLECTIONS.MESSAGES).doc(mId), { status: 'read' });
          });
          await batch.commit();
        }

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

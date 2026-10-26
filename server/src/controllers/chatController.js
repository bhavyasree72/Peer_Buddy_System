const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { COLLECTIONS, getDoc, setDoc, updateDoc, queryDocs, nowISO, collection } = require('../database/firestoreDb');

// GET /api/chat/conversations
async function getConversations(req, res) {
  try {
    if (req.user.role === 'faculty') {
      return res.status(403).json({ error: 'Access denied: Faculty accounts cannot access private student conversations.' });
    }
    const userId = req.user.userId;

    // Get all active connections for this user
    // Firestore doesn't support OR on different fields, so we do two queries
    const connsA = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_a', '==', userId], ['status', '==', 'active']]);
    const connsB = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_b', '==', userId], ['status', '==', 'active']]);
    
    const allConns = [...connsA, ...connsB];
    // Deduplicate by connection_id
    const connMap = new Map();
    allConns.forEach(c => connMap.set(c.connection_id, c));
    const connections = Array.from(connMap.values());

    const conversations = [];
    for (const conn of connections) {
      const buddyId = conn.user_a === userId ? conn.user_b : conn.user_a;
      
      // Get buddy info
      const buddyUser = await getDoc(COLLECTIONS.USERS, buddyId);
      let buddyName = buddyUser ? buddyUser.email : 'NMIMS User';
      let buddyPhoto = null;
      let buddyRole = buddyUser ? buddyUser.role : 'student';

      const studentProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, buddyId);
      const staffProf = await getDoc(COLLECTIONS.STAFF_PROFILES, buddyId);
      if (studentProf) {
        buddyName = studentProf.full_name || buddyName;
        buddyPhoto = studentProf.photo_url;
      } else if (staffProf) {
        buddyName = staffProf.full_name || buddyName;
        buddyPhoto = staffProf.photo_url;
      }

      // Get last message
      const lastMessages = await queryDocs(
        COLLECTIONS.MESSAGES,
        [['connection_id', '==', conn.connection_id]],
        'sent_at', 'desc', 1
      );
      const lastMsg = lastMessages[0] || null;

      // Count unread messages
      const unreadMessages = await queryDocs(
        COLLECTIONS.MESSAGES,
        [['connection_id', '==', conn.connection_id], ['sender_id', '!=', userId]]
      );
      const unreadCount = unreadMessages.filter(m => m.status !== 'read').length;

      conversations.push({
        connection_id: conn.connection_id,
        created_at: conn.created_at,
        buddy_id: buddyId,
        buddy_name: buddyName,
        buddy_photo: buddyPhoto,
        buddy_role: buddyRole,
        last_message: lastMsg ? lastMsg.body : null,
        last_message_at: lastMsg ? lastMsg.sent_at : null,
        unread_count: unreadCount
      });
    }

    // Sort by last_message_at DESC
    conversations.sort((a, b) => {
      if (!a.last_message_at && !b.last_message_at) return 0;
      if (!a.last_message_at) return 1;
      if (!b.last_message_at) return -1;
      return new Date(b.last_message_at) - new Date(a.last_message_at);
    });

    return res.json({ conversations });
  } catch (err) {
    console.error('getConversations error:', err);
    return res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
}

// GET /api/chat/messages/:connectionId
async function getMessages(req, res) {
  try {
    if (req.user.role === 'faculty') {
      return res.status(403).json({ error: 'Access denied: Faculty accounts cannot access private student conversations.' });
    }
    const userId = req.user.userId;
    const { connectionId } = req.params;

    // Verify user is participant
    const conn = await getDoc(COLLECTIONS.CONNECTIONS, connectionId);
    if (!conn || conn.status !== 'active' || (conn.user_a !== userId && conn.user_b !== userId)) {
      return res.status(403).json({ error: 'Access denied: You are not an authorized participant in this private conversation.' });
    }

    // Get messages ordered by sent_at
    const messages = await queryDocs(
      COLLECTIONS.MESSAGES,
      [['connection_id', '==', connectionId]],
      'sent_at', 'asc'
    );

    // Enrich with sender names
    for (const msg of messages) {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, msg.sender_id);
      const stp = await getDoc(COLLECTIONS.STAFF_PROFILES, msg.sender_id);
      const u = await getDoc(COLLECTIONS.USERS, msg.sender_id);
      msg.sender_name = (sp && sp.full_name) || (stp && stp.full_name) || (u && u.email) || 'NMIMS User';
    }

    // Mark received messages as read
    const unreadMsgs = messages.filter(m => m.sender_id !== userId && m.status !== 'read');
    for (const msg of unreadMsgs) {
      await updateDoc(COLLECTIONS.MESSAGES, msg.message_id, { status: 'read' });
    }

    return res.json({ messages });
  } catch (err) {
    console.error('getMessages error:', err);
    return res.status(500).json({ error: 'Failed to load messages.' });
  }
}

// POST /api/chat/send
async function sendMessage(req, res) {
  try {
    if (req.user.role === 'faculty') {
      return res.status(403).json({ error: 'Access denied: Faculty accounts cannot participate in student chat.' });
    }
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
    const conn = await getDoc(COLLECTIONS.CONNECTIONS, connectionId);
    if (!conn || conn.status !== 'active' || (conn.user_a !== senderId && conn.user_b !== senderId)) {
      return res.status(403).json({ error: 'Connection not found or inactive.' });
    }

    const messageId = uuidv4();
    let attachmentUrl = null;
    let attachmentName = null;
    let attachmentType = null;

    if (req.file) {
      // Upload to Firebase Storage
      try {
        const { getStorage } = require('../utils/firebaseAdmin');
        const bucket = getStorage().bucket();
        const ext = path.extname(req.file.originalname).toLowerCase();
        const storageKey = `chat/${uuidv4()}${ext}`;
        
        const file = bucket.file(storageKey);
        await file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
          public: true
        });
        
        attachmentUrl = `https://storage.googleapis.com/${bucket.name}/${storageKey}`;
      } catch (storageErr) {
        console.error('Firebase Storage upload error:', storageErr);
        // Fallback to local
        const ext = path.extname(req.file.originalname).toLowerCase();
        attachmentUrl = `/uploads/${messageId}${ext}`;
      }
      attachmentName = req.file.originalname;
      attachmentType = req.file.mimetype;
    }

    const now = nowISO();
    const messageData = {
      message_id: messageId,
      connection_id: connectionId,
      sender_id: senderId,
      body: body ? body.trim() : '',
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      attachment_type: attachmentType,
      status: 'sent',
      sent_at: now
    };

    await setDoc(COLLECTIONS.MESSAGES, messageId, messageData);

    return res.status(201).json({
      message: 'Message sent',
      chatMessage: messageData
    });
  } catch (err) {
    console.error('sendMessage error:', err);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
}

// GET /api/chat/attachments/:messageId
async function downloadAttachment(req, res) {
  try {
    const userId = req.user.userId;
    if (req.user.role === 'faculty') {
      return res.status(403).json({ error: 'Access denied: Faculty accounts cannot access chat attachments.' });
    }
    const { messageId } = req.params;

    const msg = await getDoc(COLLECTIONS.MESSAGES, messageId);
    if (!msg) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }
    if (!msg.attachment_url) {
      return res.status(404).json({ error: 'No attachment for this message.' });
    }

    // Verify requesting user is participant
    const conn = await getDoc(COLLECTIONS.CONNECTIONS, msg.connection_id);
    if (!conn || (conn.user_a !== userId && conn.user_b !== userId && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view this attachment.' });
    }

    if (msg.attachment_url.startsWith('http://') || msg.attachment_url.startsWith('https://')) {
      return res.redirect(msg.attachment_url);
    }

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
async function startDirectConversation(req, res) {
  try {
    if (req.user.role === 'faculty') {
      return res.status(403).json({ error: 'Access denied: Faculty accounts cannot initiate private conversations.' });
    }
    const senderId = req.user.userId;
    const { targetUserId } = req.body;

    if (!targetUserId) return res.status(400).json({ error: 'Target user ID is required.' });
    if (senderId === targetUserId) return res.status(400).json({ error: 'Cannot initiate a conversation with yourself.' });

    const targetUser = await getDoc(COLLECTIONS.USERS, targetUserId);
    if (!targetUser || targetUser.status !== 'active') {
      return res.status(404).json({ error: 'Target user not found or inactive.' });
    }

    // Check existing connection (both directions)
    const existA = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_a', '==', senderId], ['user_b', '==', targetUserId], ['status', '==', 'active']], null, 'asc', 1);
    const existB = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_a', '==', targetUserId], ['user_b', '==', senderId], ['status', '==', 'active']], null, 'asc', 1);
    
    const existing = existA.length > 0 ? existA[0] : (existB.length > 0 ? existB[0] : null);
    if (existing) {
      return res.json({ message: 'Conversation already exists.', connectionId: existing.connection_id });
    }

    const connectionId = uuidv4();
    await setDoc(COLLECTIONS.CONNECTIONS, connectionId, {
      connection_id: connectionId,
      user_a: senderId,
      user_b: targetUserId,
      status: 'active',
      created_at: nowISO(),
      ended_at: null
    });

    return res.status(201).json({ message: 'Private conversation opened.', connectionId });
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

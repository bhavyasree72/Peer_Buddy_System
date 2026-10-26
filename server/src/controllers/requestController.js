const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  getDoc,
  setDoc,
  updateDoc,
  queryDocs,
  nowISO,
  getAllDocs
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

const inflightRequests = new Set();

// POST /api/requests/send
async function sendRequest(req, res) {
  const senderId = req.user?.userId;
  const { receiverId, note } = req.body;

  if (!receiverId) {
    return res.status(400).json({ error: 'Receiver user ID is required.' });
  }

  if (senderId === receiverId) {
    return res.status(400).json({ error: 'You cannot send a buddy request to yourself.' });
  }

  const lockKey = `${senderId}:${receiverId}`;
  if (inflightRequests.has(lockKey)) {
    return res.status(409).json({ error: 'A request to this student is already being processed. Please wait.' });
  }
  inflightRequests.add(lockKey);

  try {
    if (note && note.length > 200) {
      return res.status(400).json({ error: 'Note must be at most 200 characters.' });
    }

    const receiverUser = await getDoc(COLLECTIONS.USERS, receiverId);
    const receiverProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, receiverId);

    if (!receiverUser || !receiverProf) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    if (receiverProf.open_to_requests === 0 || receiverProf.open_to_requests === false) {
      return res.status(400).json({ error: 'This student is currently not open to new buddy requests.' });
    }

    // Check if already connected
    const connsA = await queryDocs(COLLECTIONS.CONNECTIONS, [
      ['user_a', '==', senderId],
      ['user_b', '==', receiverId]
    ]);
    const connsB = await queryDocs(COLLECTIONS.CONNECTIONS, [
      ['user_a', '==', receiverId],
      ['user_b', '==', senderId]
    ]);
    const activeConns = [...connsA, ...connsB].filter(c => c.status === 'active');
    if (activeConns.length > 0) {
      return res.status(400).json({ error: 'You are already connected with this student.' });
    }

    // Check duplicate pending request (outgoing)
    const existingReqs = await queryDocs(COLLECTIONS.BUDDY_REQUESTS, [
      ['sender_id', '==', senderId],
      ['receiver_id', '==', receiverId]
    ]);
    const pendingReq = existingReqs.find(r => r.status === 'pending');
    if (pendingReq) {
      // Idempotency: If created within the last 15 seconds (e.g. rapid double-click or network retry), return success
      const timeDiff = Date.now() - new Date(pendingReq.created_at).getTime();
      if (timeDiff < 15000) {
        const receiverFirstName = receiverProf.full_name ? receiverProf.full_name.split(' ')[0] : 'the student';
        return res.status(200).json({
          message: `Request sent to ${receiverFirstName}. We will let you know when they respond.`,
          requestId: pendingReq.request_id || pendingReq.id,
          needsMentorReview: !!pendingReq.needs_mentor_review,
          alreadySent: true
        });
      }
      return res.status(400).json({ error: 'You already have a pending request to this student.' });
    }

    // Check if receiver already sent a pending request to sender (incoming)
    const incomingReqs = await queryDocs(COLLECTIONS.BUDDY_REQUESTS, [
      ['sender_id', '==', receiverId],
      ['receiver_id', '==', senderId]
    ]);
    const pendingIncoming = incomingReqs.find(r => r.status === 'pending');
    if (pendingIncoming) {
      return res.status(400).json({ error: 'This student has already sent you a buddy request. Please check your incoming requests.' });
    }

    // Check maximum 10 pending outgoing requests
    const myOutgoing = await queryDocs(COLLECTIONS.BUDDY_REQUESTS, [
      ['sender_id', '==', senderId]
    ]);
    const pendingOutgoingCount = myOutgoing.filter(r => r.status === 'pending').length;
    if (pendingOutgoingCount >= 10) {
      return res.status(400).json({ error: 'You have reached the maximum limit of 10 pending buddy requests. Please wait for responses or cancel older requests.' });
    }

    // Mentor review criteria
    // 1. Sender reported before
    const reportDocs = await queryDocs(COLLECTIONS.REPORTS, [['reported_user_id', '==', senderId]]);
    const wasReported = reportDocs.length > 0;

    // 2. Year gap (year 1 vs year >= 3)
    const senderProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, senderId) || {};
    const senderYear = Number(senderProf.year) || 1;
    const receiverYear = Number(receiverProf.year) || 1;
    const isYearGap = (senderYear === 1 && receiverYear >= 3) || (receiverYear === 1 && senderYear >= 3);

    // 3. Admin review_all_requests setting
    const reviewSetting = await getDoc(COLLECTIONS.SETTINGS, 'review_all_requests');
    const reviewAll = reviewSetting && (reviewSetting.value === '1' || reviewSetting.value === 1 || reviewSetting.value === true);

    const needsMentorReview = (wasReported || isYearGap || reviewAll) ? 1 : 0;
    const requestId = `req_${senderId}_${receiverId}`;
    const now = nowISO();

    await setDoc(COLLECTIONS.BUDDY_REQUESTS, requestId, {
      request_id: requestId,
      sender_id: senderId,
      receiver_id: receiverId,
      note: note ? note.trim() : null,
      status: 'pending',
      needs_mentor_review: needsMentorReview,
      created_at: now
    });

    const senderName = senderProf.full_name || 'A student';

    // Notification to receiver
    await createNotification(
      receiverId,
      'new_request',
      `${senderName} sent you a buddy request.`,
      '/buddies?tab=received'
    );

    const receiverFirstName = receiverProf.full_name ? receiverProf.full_name.split(' ')[0] : 'the student';
    return res.status(201).json({
      message: `Request sent to ${receiverFirstName}. We will let you know when they respond.`,
      requestId,
      needsMentorReview: !!needsMentorReview
    });
  } catch (err) {
    console.error('sendRequest error:', err);
    return res.status(500).json({ error: 'Failed to send buddy request.' });
  } finally {
    inflightRequests.delete(lockKey);
  }
}

// POST /api/requests/:requestId/respond
async function respondToRequest(req, res) {
  try {
    const userId = req.user.userId;
    const { requestId } = req.params;
    const { action } = req.body;

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or decline.' });
    }

    const request = await getDoc(COLLECTIONS.BUDDY_REQUESTS, requestId);
    if (!request || request.receiver_id !== userId || request.status !== 'pending') {
      return res.status(404).json({ error: 'Pending request not found.' });
    }

    const receiverProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, userId);
    const receiverName = receiverProf ? receiverProf.full_name : 'Your peer';
    const now = nowISO();

    if (action === 'accept') {
      await updateDoc(COLLECTIONS.BUDDY_REQUESTS, requestId, {
        status: 'accepted',
        responded_at: now
      });

      const connectionId = uuidv4();
      await setDoc(COLLECTIONS.CONNECTIONS, connectionId, {
        connection_id: connectionId,
        user_a: request.sender_id,
        user_b: request.receiver_id,
        status: 'active',
        created_at: now
      });

      await createNotification(
        request.sender_id,
        'request_accepted',
        `${receiverName} accepted your buddy request! Chat is now open.`,
        `/chat?connectionId=${connectionId}`
      );

      return res.json({
        message: 'Buddy request accepted. You can now chat and schedule study sessions.',
        connectionId
      });
    } else {
      await updateDoc(COLLECTIONS.BUDDY_REQUESTS, requestId, {
        status: 'declined',
        responded_at: now
      });

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

    const request = await getDoc(COLLECTIONS.BUDDY_REQUESTS, requestId);
    if (!request || request.sender_id !== userId || request.status !== 'pending') {
      return res.status(404).json({ error: 'Pending request not found.' });
    }

    await updateDoc(COLLECTIONS.BUDDY_REQUESTS, requestId, {
      status: 'cancelled',
      responded_at: nowISO()
    });

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

    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p.name]));
    const schools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const schoolMap = new Map(schools.map(s => [s.id, s.name]));

    // Received requests
    const rawReceived = await queryDocs(COLLECTIONS.BUDDY_REQUESTS, [
      ['receiver_id', '==', userId],
      ['status', '==', 'pending']
    ]);
    const received = [];
    for (const br of rawReceived) {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.sender_id);
      received.push({
        ...br,
        sender_name: sp ? sp.full_name : 'Student',
        photo_url: sp ? sp.photo_url : null,
        semester: sp ? sp.semester : null,
        program_name: sp && sp.program_id ? (progMap.get(sp.program_id) || null) : null,
        school_name: sp && sp.school_id ? (schoolMap.get(sp.school_id) || null) : null
      });
    }
    received.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Sent requests
    const rawSent = await queryDocs(COLLECTIONS.BUDDY_REQUESTS, [
      ['sender_id', '==', userId],
      ['status', '==', 'pending']
    ]);
    const sent = [];
    for (const br of rawSent) {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.receiver_id);
      sent.push({
        ...br,
        receiver_name: sp ? sp.full_name : 'Student',
        photo_url: sp ? sp.photo_url : null,
        semester: sp ? sp.semester : null,
        program_name: sp && sp.program_id ? (progMap.get(sp.program_id) || null) : null,
        school_name: sp && sp.school_id ? (schoolMap.get(sp.school_id) || null) : null
      });
    }
    sent.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Active Connected Buddies
    const connsA = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_a', '==', userId], ['status', '==', 'active']]);
    const connsB = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_b', '==', userId], ['status', '==', 'active']]);
    const connMap = new Map();
    [...connsA, ...connsB].forEach(c => connMap.set(c.connection_id || c.id, c));
    const allConns = Array.from(connMap.values());

    const buddies = [];
    for (const c of allConns) {
      const buddyId = c.user_a === userId ? c.user_b : c.user_a;
      const u = await getDoc(COLLECTIONS.USERS, buddyId);
      if (!u || u.role !== 'student') continue;
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, buddyId);
      buddies.push({
        connection_id: c.connection_id || c.id,
        created_at: c.created_at,
        buddy_id: buddyId,
        full_name: sp ? sp.full_name : (u ? u.email : 'Buddy'),
        photo_url: sp ? sp.photo_url : null,
        semester: sp ? sp.semester : null,
        program_name: sp && sp.program_id ? (progMap.get(sp.program_id) || null) : null,
        school_name: sp && sp.school_id ? (schoolMap.get(sp.school_id) || null) : null,
        email: u ? u.email : null,
        show_email: sp ? sp.show_email : 1
      });
    }
    buddies.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    return res.json({
      received,
      sent,
      buddies
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

    const conn = await getDoc(COLLECTIONS.CONNECTIONS, connectionId);
    if (!conn || (conn.user_a !== userId && conn.user_b !== userId) || conn.status !== 'active') {
      return res.status(404).json({ error: 'Active connection not found.' });
    }

    const otherUserId = conn.user_a === userId ? conn.user_b : conn.user_a;
    const now = nowISO();

    await updateDoc(COLLECTIONS.CONNECTIONS, connectionId, {
      status: 'ended',
      ended_at: now
    });

    const senderProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, userId);
    const senderName = senderProf ? senderProf.full_name : 'Your buddy';

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

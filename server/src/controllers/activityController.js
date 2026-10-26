const {
  COLLECTIONS,
  queryDocs,
  getDoc,
  getAllDocs
} = require('../database/firestoreDb');

// GET /api/activity/history
async function getActivityHistory(req, res) {
  try {
    const userId = req.user.userId;

    // 1. Buddies Connected (only active connections where the other user is an active student)
    const connsA = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_a', '==', userId], ['status', '==', 'active']]);
    const connsB = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_b', '==', userId], ['status', '==', 'active']]);
    const connMap = new Map();
    [...connsA, ...connsB].forEach(c => connMap.set(c.connection_id || c.id, c));
    const allConns = Array.from(connMap.values());

    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p.name]));

    const buddies = [];
    for (const c of allConns) {
      const buddyId = c.user_a === userId ? c.user_b : c.user_a;
      const otherUser = await getDoc(COLLECTIONS.USERS, buddyId);
      if (!otherUser || otherUser.role !== 'student') continue;
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, buddyId);
      buddies.push({
        connection_id: c.connection_id || c.id,
        created_at: c.created_at,
        status: c.status,
        buddy_id: buddyId,
        buddy_name: (sp && sp.full_name) ? sp.full_name : otherUser.email.split('@')[0],
        buddy_photo: sp ? sp.photo_url : null,
        program_name: sp && sp.program_id ? (progMap.get(sp.program_id) || null) : null,
        semester: sp ? sp.semester : null
      });
    }
    buddies.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // 2. Study Sessions
    const sessOrg = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['organizer_id', '==', userId]]);
    const sessPart = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['partner_id', '==', userId]]);
    const sessMap = new Map();
    [...sessOrg, ...sessPart].forEach(s => sessMap.set(s.session_id || s.id, s));
    const rawSessions = Array.from(sessMap.values());

    const sessions = [];
    for (const s of rawSessions) {
      const sessId = s.session_id || s.id;
      const orgProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, s.organizer_id);
      const partProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, s.partner_id);
      
      const attDocs = await queryDocs(COLLECTIONS.SESSION_ATTENDANCE, [
        ['session_id', '==', sessId],
        ['user_id', '==', userId]
      ]);
      const myAtt = attDocs.length > 0 ? attDocs[0].attended : null;

      sessions.push({
        ...s,
        session_id: sessId,
        organizer_name: orgProf ? orgProf.full_name : 'Organizer',
        partner_name: partProf ? partProf.full_name : 'Partner',
        my_attendance: myAtt
      });
    }
    sessions.sort((a, b) => new Date(b.start_at || 0) - new Date(a.start_at || 0));

    // 3. Feedback received
    const rawReviews = await queryDocs(COLLECTIONS.REVIEWS, [['reviewee_id', '==', userId]]);
    const feedback = [];
    for (const r of rawReviews) {
      const reviewerProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, r.reviewer_id);
      const sessDoc = r.session_id ? await getDoc(COLLECTIONS.STUDY_SESSIONS, r.session_id) : null;
      feedback.push({
        ...r,
        review_id: r.review_id || r.id,
        reviewer_name: reviewerProf ? reviewerProf.full_name : 'Anonymous Peer',
        session_title: sessDoc ? sessDoc.title : 'Study Session',
        subject: sessDoc ? sessDoc.subject : ''
      });
    }
    feedback.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // 4. Chat history summary
    const chats = [];
    for (const c of allConns) {
      const connId = c.connection_id || c.id;
      const buddyId = c.user_a === userId ? c.user_b : c.user_a;
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, buddyId);
      const msgs = await queryDocs(COLLECTIONS.MESSAGES, [['connection_id', '==', connId]]);
      let lastActivity = null;
      msgs.forEach(m => {
        if (!lastActivity || new Date(m.sent_at) > new Date(lastActivity)) {
          lastActivity = m.sent_at;
        }
      });
      chats.push({
        connection_id: connId,
        buddy_name: sp ? sp.full_name : 'Buddy',
        total_messages: msgs.length,
        last_activity: lastActivity
      });
    }
    chats.sort((a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0));

    // Calculate Summary Tiles:
    const now = new Date();
    const firstDayMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const completedThisMonth = sessions.filter(s => s.status === 'completed' && s.start_at >= firstDayMonth).length;

    let totalMinutes = 0;
    sessions.filter(s => s.status === 'completed' || s.my_attendance === 'yes').forEach(s => {
      const diff = new Date(s.end_at) - new Date(s.start_at);
      if (diff > 0) totalMinutes += (diff / (1000 * 60));
    });
    const totalHours = (totalMinutes / 60).toFixed(1);

    const activeBuddiesCount = buddies.filter(b => b.status === 'active').length;

    const avgRating = feedback.length >= 3 
      ? (feedback.reduce((acc, f) => acc + (((Number(f.punctuality) || 0) + (Number(f.helpfulness) || 0) + (Number(f.communication) || 0)) / 3), 0) / feedback.length).toFixed(1)
      : null;

    return res.json({
      summary: {
        completedThisMonth,
        totalStudyHours: totalHours,
        buddiesConnected: activeBuddiesCount,
        averageRating: avgRating,
        reviewCount: feedback.length
      },
      buddies,
      sessions,
      feedback,
      chats
    });
  } catch (err) {
    console.error('getActivityHistory error:', err);
    return res.status(500).json({ error: 'Failed to fetch activity history.' });
  }
}

module.exports = {
  getActivityHistory
};

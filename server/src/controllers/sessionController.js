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
    // Get all sessions for either participant
    const s1 = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['organizer_id', '==', organizerId]]);
    const s2 = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['partner_id', '==', organizerId]]);
    const s3 = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['organizer_id', '==', partnerId]]);
    const s4 = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['partner_id', '==', partnerId]]);

    const checkMap = new Map();
    [...s1, ...s2, ...s3, ...s4].forEach(s => checkMap.set(s.session_id || s.id, s));

    const newStart = new Date(startAt).getTime();
    const newEnd = new Date(endAt).getTime();

    const hasConflict = Array.from(checkMap.values()).some(s => {
      if (!['proposed', 'confirmed'].includes(s.status)) return false;
      const exStart = new Date(s.start_at).getTime();
      const exEnd = new Date(s.end_at).getTime();
      return (exStart < newEnd && exEnd > newStart);
    });

    if (hasConflict) {
      return res.status(409).json({ error: 'You already have a session at this time. Pick another slot?' });
    }

    const sessionId = uuidv4();
    await setDoc(COLLECTIONS.STUDY_SESSIONS, sessionId, {
      session_id: sessionId,
      connection_id: connectionId || null,
      organizer_id: organizerId,
      partner_id: partnerId,
      title: title.trim(),
      subject: subject.trim(),
      start_at: startAt,
      end_at: endAt,
      mode,
      location_or_link: locationOrLink.trim(),
      status: 'proposed',
      department: department || null,
      semester: semester || 1,
      confirmed_by_organizer: 0,
      confirmed_by_partner: 0,
      is_verified: 0,
      created_at: nowISO()
    });

    const orgProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, organizerId);
    const orgName = orgProf ? orgProf.full_name : 'Your buddy';

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
    const { action, suggestedStartAt, suggestedEndAt } = req.body;

    const session = await getDoc(COLLECTIONS.STUDY_SESSIONS, sessionId);
    if (!session || session.partner_id !== userId || session.status !== 'proposed') {
      return res.status(404).json({ error: 'Proposed session not found.' });
    }

    const partnerProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, userId);
    const partnerName = partnerProf ? partnerProf.full_name : 'Your buddy';

    if (action === 'accept') {
      await updateDoc(COLLECTIONS.STUDY_SESSIONS, sessionId, { status: 'confirmed' });

      await createNotification(
        session.organizer_id,
        'session_accepted',
        `${partnerName} accepted the study session "${session.title}".`,
        '/sessions'
      );

      return res.json({ message: 'Session confirmed and added to calendar.' });
    } else if (action === 'decline') {
      await updateDoc(COLLECTIONS.STUDY_SESSIONS, sessionId, { status: 'declined' });

      await createNotification(
        session.organizer_id,
        'session_declined',
        `${partnerName} declined the study session "${session.title}".`,
        '/sessions'
      );

      return res.json({ message: 'Session declined.' });
    } else if (action === 'suggest_new_time') {
      if (!suggestedStartAt || !suggestedEndAt) {
        return res.status(400).json({ error: 'Please specify the suggested new time.' });
      }

      await updateDoc(COLLECTIONS.STUDY_SESSIONS, sessionId, {
        start_at: suggestedStartAt,
        end_at: suggestedEndAt,
        status: 'proposed',
        organizer_id: userId,
        partner_id: session.organizer_id
      });

      await createNotification(
        session.organizer_id,
        'session_time_suggested',
        `${partnerName} suggested a new time for "${session.title}".`,
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
    const { attended } = req.body;

    if (!['yes', 'no'].includes(attended)) {
      return res.status(400).json({ error: 'Attendance must be yes or no.' });
    }

    const session = await getDoc(COLLECTIONS.STUDY_SESSIONS, sessionId);
    if (!session || (session.organizer_id !== userId && session.partner_id !== userId)) {
      return res.status(404).json({ error: 'Session not found.' });
    }

    if (new Date(session.end_at) > new Date()) {
      return res.status(400).json({ error: 'Attendance can only be marked after the session end time.' });
    }

    // Upsert attendance record
    const attKey = `${sessionId}_${userId}`;
    const existingAtt = await queryDocs(COLLECTIONS.SESSION_ATTENDANCE, [
      ['session_id', '==', sessionId],
      ['user_id', '==', userId]
    ]);

    if (existingAtt.length > 0) {
      await updateDoc(COLLECTIONS.SESSION_ATTENDANCE, existingAtt[0].id || existingAtt[0].attendance_id || attKey, {
        attended,
        marked_at: nowISO()
      });
    } else {
      await setDoc(COLLECTIONS.SESSION_ATTENDANCE, attKey, {
        id: attKey,
        session_id: sessionId,
        user_id: userId,
        attended,
        marked_at: nowISO()
      });
    }

    // Dual Confirmation
    const isOrganizer = session.organizer_id === userId;
    const confirmedVal = attended === 'yes' ? 1 : 0;
    const sessionUpdates = {};

    if (isOrganizer) {
      sessionUpdates.confirmed_by_organizer = confirmedVal;
    } else {
      sessionUpdates.confirmed_by_partner = confirmedVal;
    }

    const updatedOrganizerConf = isOrganizer ? confirmedVal : (session.confirmed_by_organizer || 0);
    const updatedPartnerConf = !isOrganizer ? confirmedVal : (session.confirmed_by_partner || 0);
    const isBothConfirmed = updatedOrganizerConf === 1 && updatedPartnerConf === 1;

    if (isBothConfirmed) {
      sessionUpdates.is_verified = 1;
      sessionUpdates.status = 'completed';
    }

    await updateDoc(COLLECTIONS.STUDY_SESSIONS, sessionId, sessionUpdates);

    return res.json({
      message: 'Attendance recorded successfully.',
      verified: isBothConfirmed,
      verificationCount: updatedOrganizerConf + updatedPartnerConf
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

    const s1 = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['organizer_id', '==', userId]]);
    const s2 = await queryDocs(COLLECTIONS.STUDY_SESSIONS, [['partner_id', '==', userId]]);
    const sMap = new Map();
    [...s1, ...s2].forEach(s => sMap.set(s.session_id || s.id, s));
    const allSessions = Array.from(sMap.values());

    const sessions = [];
    for (const s of allSessions) {
      const sessId = s.session_id || s.id;
      const orgProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, s.organizer_id);
      const partProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, s.partner_id);

      const attDocs = await queryDocs(COLLECTIONS.SESSION_ATTENDANCE, [
        ['session_id', '==', sessId],
        ['user_id', '==', userId]
      ]);
      const myAtt = attDocs.length > 0 ? attDocs[0].attended : null;

      const reviewDocs = await queryDocs(COLLECTIONS.REVIEWS, [
        ['session_id', '==', sessId],
        ['reviewer_id', '==', userId]
      ]);
      const myRevId = reviewDocs.length > 0 ? (reviewDocs[0].review_id || reviewDocs[0].id) : null;

      sessions.push({
        ...s,
        session_id: sessId,
        organizer_name: orgProf ? orgProf.full_name : 'Organizer',
        organizer_photo: orgProf ? orgProf.photo_url : null,
        partner_name: partProf ? partProf.full_name : 'Partner',
        partner_photo: partProf ? partProf.photo_url : null,
        my_attendance: myAtt,
        my_review_id: myRevId
      });
    }

    sessions.sort((a, b) => new Date(a.start_at || 0) - new Date(b.start_at || 0));

    return res.json({ sessions });
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

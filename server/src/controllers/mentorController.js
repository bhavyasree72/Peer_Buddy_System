const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const {
  COLLECTIONS,
  getDoc,
  setDoc,
  updateDoc,
  queryDocs,
  getAllDocs,
  nowISO
} = require('../database/firestoreDb');

// GET /api/mentor/dashboard
async function getMentorDashboard(req, res) {
  try {
    const mentorId = req.user.userId;

    // Requests awaiting review count
    const pendingReqs = await queryDocs(COLLECTIONS.BUDDY_REQUESTS, [
      ['status', '==', 'pending']
    ]);
    const requestsToReview = pendingReqs.filter(r => r.needs_mentor_review === 1 || r.needs_mentor_review === true).length;

    // Active connections for this mentor
    const connsA = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_a', '==', mentorId], ['status', '==', 'active']]);
    const connsB = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_b', '==', mentorId], ['status', '==', 'active']]);
    const mentorConnBuddyIds = new Set([...connsA.map(c => c.user_b), ...connsB.map(c => c.user_a)]);

    // Allocated students count
    const allStudents = await queryDocs(COLLECTIONS.USERS, [
      ['role', '==', 'student'],
      ['status', '==', 'active']
    ]);

    let studentsCount = 0;
    for (const u of allStudents) {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, u.user_id);
      if (sp && (sp.mentor_id === mentorId || mentorConnBuddyIds.has(u.user_id))) {
        studentsCount++;
      }
    }

    // Resources shared by this mentor
    const myResources = await queryDocs(COLLECTIONS.RESOURCES, [['mentor_id', '==', mentorId]]);
    const resourcesShared = myResources.length;

    // Recent activity list
    const recentActivity = [];
    const reviews = await queryDocs(COLLECTIONS.MENTOR_REVIEWS, [['mentor_id', '==', mentorId]]);
    reviews.sort((a, b) => new Date(b.reviewed_at || 0) - new Date(a.reviewed_at || 0));

    for (const r of reviews.slice(0, 5)) {
      const br = r.request_id ? await getDoc(COLLECTIONS.BUDDY_REQUESTS, r.request_id) : null;
      let sName = 'Student A';
      let rName = 'Student B';
      if (br) {
        const sp1 = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.sender_id);
        const sp2 = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.receiver_id);
        if (sp1) sName = sp1.full_name;
        if (sp2) rName = sp2.full_name;
      }
      recentActivity.push({
        id: r.review_id || r.id,
        type: 'review',
        text: `Reviewed request between ${sName} and ${rName} (${r.decision})`,
        time: r.reviewed_at
      });
    }

    const guidance = await queryDocs(COLLECTIONS.GUIDANCE_MESSAGES, [['mentor_id', '==', mentorId]]);
    guidance.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    for (const g of guidance.slice(0, 5)) {
      recentActivity.push({
        id: g.guidance_id || g.id,
        type: 'guidance',
        text: `Sent guidance message: "${g.subject}"`,
        time: g.created_at
      });
    }

    recentActivity.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

    return res.json({
      summary: {
        requestsToReview,
        studentsCount,
        resourcesShared
      },
      recentActivity: recentActivity.slice(0, 8)
    });
  } catch (err) {
    console.error('getMentorDashboard error:', err);
    return res.status(500).json({ error: 'Failed to load mentor dashboard.' });
  }
}

// GET /api/mentor/review-requests
async function getReviewRequests(req, res) {
  try {
    const mentorId = req.user.userId;

    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p.name]));
    const schools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const schoolMap = new Map(schools.map(s => [s.id, s.name]));

    const allReqs = await queryDocs(COLLECTIONS.BUDDY_REQUESTS, [
      ['status', '==', 'pending']
    ]);
    const flagged = allReqs.filter(r => r.needs_mentor_review === 1 || r.needs_mentor_review === true);

    const pending = [];
    for (const br of flagged) {
      const sProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.sender_id);
      const rProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.receiver_id);
      pending.push({
        ...br,
        flag_reason: br.flag_reason || 'Cross-year / academic gap',
        sender_name: sProf ? sProf.full_name : 'Student',
        sender_semester: sProf ? sProf.semester : null,
        sender_year: sProf ? sProf.year : null,
        sender_program: sProf && sProf.program_id ? (progMap.get(sProf.program_id) || null) : null,
        sender_school: sProf && sProf.school_id ? (schoolMap.get(sProf.school_id) || null) : null,
        receiver_name: rProf ? rProf.full_name : 'Student',
        receiver_semester: rProf ? rProf.semester : null,
        receiver_year: rProf ? rProf.year : null,
        receiver_program: rProf && rProf.program_id ? (progMap.get(rProf.program_id) || null) : null,
        receiver_school: rProf && rProf.school_id ? (schoolMap.get(rProf.school_id) || null) : null
      });
    }
    pending.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

    const myReviews = await queryDocs(COLLECTIONS.MENTOR_REVIEWS, [['mentor_id', '==', mentorId]]);
    const reviewed = [];
    for (const mr of myReviews) {
      const br = mr.request_id ? await getDoc(COLLECTIONS.BUDDY_REQUESTS, mr.request_id) : null;
      let sProf = null;
      let rProf = null;
      if (br) {
        sProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.sender_id);
        rProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, br.receiver_id);
      }
      reviewed.push({
        ...mr,
        note: br ? br.note : null,
        flag_reason: (br && br.flag_reason) || 'Cross-year / academic gap',
        sender_name: sProf ? sProf.full_name : 'Student',
        sender_semester: sProf ? sProf.semester : null,
        sender_year: sProf ? sProf.year : null,
        sender_program: sProf && sProf.program_id ? (progMap.get(sProf.program_id) || null) : null,
        receiver_name: rProf ? rProf.full_name : 'Student',
        receiver_semester: rProf ? rProf.semester : null,
        receiver_year: rProf ? rProf.year : null,
        receiver_program: rProf && rProf.program_id ? (progMap.get(rProf.program_id) || null) : null
      });
    }
    reviewed.sort((a, b) => new Date(b.reviewed_at || 0) - new Date(a.reviewed_at || 0));

    return res.json({
      pending,
      reviewed
    });
  } catch (err) {
    console.error('getReviewRequests error:', err);
    return res.status(500).json({ error: 'Failed to load review requests.' });
  }
}

// GET /api/mentor/my-students
async function getMyStudents(req, res) {
  try {
    const mentorId = req.user.userId;
    const { q, schoolId, semester } = req.query;

    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p]));
    const schools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const schoolMap = new Map(schools.map(s => [s.id, s]));

    const connsA = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_a', '==', mentorId], ['status', '==', 'active']]);
    const connsB = await queryDocs(COLLECTIONS.CONNECTIONS, [['user_b', '==', mentorId], ['status', '==', 'active']]);
    const mentorConnBuddyIds = new Set([...connsA.map(c => c.user_b), ...connsB.map(c => c.user_a)]);

    const studentUsers = await queryDocs(COLLECTIONS.USERS, [
      ['role', '==', 'student'],
      ['status', '==', 'active']
    ]);

    const allActiveConns = await queryDocs(COLLECTIONS.CONNECTIONS, [['status', '==', 'active']]);

    const students = [];
    for (const u of studentUsers) {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, u.user_id);
      if (!sp) continue;

      const isAllocated = sp.mentor_id === mentorId || mentorConnBuddyIds.has(u.user_id);
      if (!isAllocated) continue;

      if (schoolId && sp.school_id !== schoolId) continue;
      if (semester && Number(sp.semester) !== parseInt(semester, 10)) continue;

      const prog = sp.program_id ? progMap.get(sp.program_id) : null;
      const sch = sp.school_id ? schoolMap.get(sp.school_id) : null;

      if (q) {
        const qLower = q.toLowerCase();
        const nMatch = sp.full_name && sp.full_name.toLowerCase().includes(qLower);
        const eMatch = u.email && u.email.toLowerCase().includes(qLower);
        const pMatch = prog && prog.name && prog.name.toLowerCase().includes(qLower);
        if (!nMatch && !eMatch && !pMatch) continue;
      }

      const activeBuddies = allActiveConns.filter(c => c.user_a === u.user_id || c.user_b === u.user_id).length;

      students.push({
        user_id: u.user_id,
        email: u.email,
        full_name: sp.full_name,
        semester: sp.semester,
        year: sp.year,
        bio: sp.bio,
        school_id: sp.school_id,
        mentor_id: sp.mentor_id,
        program_name: prog ? prog.name : null,
        school_name: sch ? sch.name : null,
        school_code: sch ? sch.code : null,
        active_buddies_count: activeBuddies
      });
    }

    students.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    return res.json({ students });
  } catch (err) {
    console.error('getMyStudents error:', err);
    return res.status(500).json({ error: 'Failed to load students.' });
  }
}

// GET /api/mentor/messages
async function getMentorMessages(req, res) {
  try {
    const mentorId = req.user.userId;
    const messages = await queryDocs(COLLECTIONS.GUIDANCE_MESSAGES, [['mentor_id', '==', mentorId]]);
    messages.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const enriched = [];
    for (const gm of messages) {
      let recipientName = null;
      if (gm.target_type === 'student' && gm.target_id) {
        const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, gm.target_id);
        recipientName = sp ? sp.full_name : null;
      }
      enriched.push({
        ...gm,
        recipient_name: recipientName
      });
    }

    return res.json({ messages: enriched });
  } catch (err) {
    console.error('getMentorMessages error:', err);
    return res.status(500).json({ error: 'Failed to load guidance messages.' });
  }
}

// POST /api/mentor/reviews/:requestId
async function reviewBuddyRequest(req, res) {
  try {
    const mentorId = req.user.userId;
    const { requestId } = req.params;
    const { decision, remarks } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected.' });
    }

    const request = await getDoc(COLLECTIONS.BUDDY_REQUESTS, requestId);
    if (!request) {
      return res.status(404).json({ error: 'Buddy request not found.' });
    }

    const reviewId = uuidv4();
    const now = nowISO();

    await setDoc(COLLECTIONS.MENTOR_REVIEWS, reviewId, {
      review_id: reviewId,
      request_id: requestId,
      mentor_id: mentorId,
      decision,
      remarks: remarks ? remarks.trim() : null,
      reviewed_at: now
    });

    if (decision === 'approved') {
      await updateDoc(COLLECTIONS.BUDDY_REQUESTS, requestId, { needs_mentor_review: 0 });
    } else {
      await updateDoc(COLLECTIONS.BUDDY_REQUESTS, requestId, {
        status: 'declined',
        responded_at: now
      });
    }

    return res.json({ message: `Request has been ${decision}.` });
  } catch (err) {
    console.error('reviewBuddyRequest error:', err);
    return res.status(500).json({ error: 'Failed to record mentor review.' });
  }
}

// POST /api/mentor/resources/upload
async function uploadResource(req, res) {
  try {
    const mentorId = req.user.userId;
    const { title, subject, semester, description, link } = req.body;

    if (!title || !subject) {
      return res.status(400).json({ error: 'Title and subject are required.' });
    }

    let fileUrlOrLink = link;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const storageKey = `resources/${uuidv4()}${ext}`;

      // Upload to Firebase Storage
      try {
        const { getStorage } = require('../utils/firebaseAdmin');
        const bucket = getStorage().bucket();
        const file = bucket.file(storageKey);
        await file.save(req.file.buffer, {
          metadata: { contentType: req.file.mimetype },
          public: true
        });
        fileUrlOrLink = `https://storage.googleapis.com/${bucket.name}/${storageKey}`;
      } catch (storageErr) {
        console.error('[Firebase Storage] Resource upload error, fallback to local:', storageErr.message);
        fileUrlOrLink = `/uploads/${uuidv4()}${ext}`;
      }
    }

    if (!fileUrlOrLink) {
      return res.status(400).json({ error: 'Either an uploaded file or external resource link is required.' });
    }

    const resourceId = uuidv4();
    await setDoc(COLLECTIONS.RESOURCES, resourceId, {
      resource_id: resourceId,
      mentor_id: mentorId,
      title: title.trim(),
      subject: subject.trim(),
      semester: Number(semester) || 1,
      file_url_or_link: fileUrlOrLink,
      description: description ? description.trim() : null,
      uploaded_at: nowISO()
    });

    return res.status(201).json({
      message: 'Resource uploaded successfully.',
      resourceId,
      fileUrl: fileUrlOrLink
    });
  } catch (err) {
    console.error('uploadResource error:', err);
    return res.status(500).json({ error: 'Failed to upload resource.' });
  }
}

// GET /api/mentor/resources
async function getResources(req, res) {
  try {
    const userRole = req.user.role;
    const userId = req.user.userId;
    const { subject, semester, q } = req.query;

    let resources = await getAllDocs(COLLECTIONS.RESOURCES);

    if (userRole === 'student') {
      const allocations = await queryDocs(COLLECTIONS.RESOURCE_ALLOCATIONS, [['student_id', '==', userId]]);
      const allocatedIds = new Set(allocations.map(a => a.resource_id));
      resources = resources.filter(r => allocatedIds.has(r.resource_id || r.id));
    }

    if (subject) {
      const subLower = subject.toLowerCase();
      resources = resources.filter(r => r.subject && r.subject.toLowerCase().includes(subLower));
    }

    if (semester) {
      const semNum = parseInt(semester, 10);
      resources = resources.filter(r => Number(r.semester) === semNum);
    }

    if (q) {
      const qLower = q.toLowerCase();
      resources = resources.filter(r =>
        (r.title && r.title.toLowerCase().includes(qLower)) ||
        (r.description && r.description.toLowerCase().includes(qLower)) ||
        (r.subject && r.subject.toLowerCase().includes(qLower))
      );
    }

    const enriched = [];
    for (const r of resources) {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, r.mentor_id);
      const stp = await getDoc(COLLECTIONS.STAFF_PROFILES, r.mentor_id);
      enriched.push({
        ...r,
        uploader_name: (sp && sp.full_name) || (stp && stp.full_name) || 'Academic Mentor'
      });
    }

    enriched.sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
    return res.json({ resources: enriched });
  } catch (err) {
    console.error('getResources error:', err);
    return res.status(500).json({ error: 'Failed to fetch resources.' });
  }
}

// POST /api/mentor/resources/:resourceId/allocate
async function allocateResource(req, res) {
  try {
    const { resourceId } = req.params;
    const { studentIds } = req.body;

    const resource = await getDoc(COLLECTIONS.RESOURCES, resourceId);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one student ID to allocate.' });
    }

    let allocatedCount = 0;
    const now = nowISO();

    for (const sid of studentIds) {
      const existing = await queryDocs(COLLECTIONS.RESOURCE_ALLOCATIONS, [
        ['resource_id', '==', resourceId],
        ['student_id', '==', sid]
      ]);

      if (existing.length === 0) {
        const allocId = uuidv4();
        await setDoc(COLLECTIONS.RESOURCE_ALLOCATIONS, allocId, {
          allocation_id: allocId,
          resource_id: resourceId,
          student_id: sid,
          allocated_at: now
        });
        allocatedCount++;
      }
    }

    return res.json({
      message: `Resource successfully allocated to ${allocatedCount} student(s).`,
      allocatedCount
    });
  } catch (err) {
    console.error('allocateResource error:', err);
    return res.status(500).json({ error: 'Failed to allocate resource.' });
  }
}

// GET /api/mentor/resources/:resourceId/download
async function downloadResource(req, res) {
  try {
    const { resourceId } = req.params;
    const userRole = req.user.role;
    const userId = req.user.userId;

    const resource = await getDoc(COLLECTIONS.RESOURCES, resourceId);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    if (userRole === 'student') {
      const alloc = await queryDocs(COLLECTIONS.RESOURCE_ALLOCATIONS, [
        ['resource_id', '==', resourceId],
        ['student_id', '==', userId]
      ]);
      if (alloc.length === 0) {
        return res.status(403).json({ error: 'Access denied. You do not have permission to download this resource.' });
      }
    }

    if (resource.file_url_or_link.startsWith('http://') || resource.file_url_or_link.startsWith('https://')) {
      return res.redirect(resource.file_url_or_link);
    }

    const filename = path.basename(resource.file_url_or_link);
    const possiblePaths = [
      path.resolve(__dirname, '../../../uploads', filename),
      path.resolve(__dirname, '../../uploads', filename),
      path.resolve(process.cwd(), 'uploads', filename)
    ];

    let filePath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      return res.status(404).json({ error: 'File not found on server storage.' });
    }

    const ext = path.extname(filename) || '.pdf';
    const safeTitle = (resource.title || 'document').replace(/[^a-zA-Z0-9_-]/g, '_') + ext;
    return res.download(filePath, safeTitle);
  } catch (err) {
    console.error('downloadResource error:', err);
    return res.status(500).json({ error: 'Failed to download resource.' });
  }
}

// POST /api/mentor/guidance
async function sendGuidanceMessage(req, res) {
  try {
    const mentorId = req.user.userId;
    const { targetType, targetId, subject, message } = req.body;

    if (!message || !targetType) {
      return res.status(400).json({ error: 'Target type and message content are required.' });
    }

    const guidanceId = uuidv4();
    await setDoc(COLLECTIONS.GUIDANCE_MESSAGES, guidanceId, {
      guidance_id: guidanceId,
      mentor_id: mentorId,
      subject: subject || 'General Guidance',
      target_type: targetType,
      target_id: targetId || null,
      message: message.trim(),
      created_at: nowISO()
    });

    return res.status(201).json({ message: 'Guidance message broadcasted successfully.' });
  } catch (err) {
    console.error('sendGuidanceMessage error:', err);
    return res.status(500).json({ error: 'Failed to send guidance message.' });
  }
}

module.exports = {
  getMentorDashboard,
  getReviewRequests,
  getMyStudents,
  getMentorMessages,
  reviewBuddyRequest,
  uploadResource,
  getResources,
  allocateResource,
  downloadResource,
  sendGuidanceMessage
};

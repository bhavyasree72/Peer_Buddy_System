const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');

// GET /api/mentor/dashboard
// Summary tiles + short recent activity list
async function getMentorDashboard(req, res) {
  try {
    const mentorId = req.user.userId;

    // Requests awaiting review count
    const pendingCountRes = await query(`
      SELECT COUNT(*) as c FROM buddy_requests WHERE status = 'pending' AND needs_mentor_review = 1
    `);
    const requestsToReview = pendingCountRes.rows[0].c || 0;

    // Allocated students count for this specific mentor
    const studentsCountRes = await query(`
      SELECT COUNT(*) as c FROM users u
      JOIN student_profiles sp ON u.user_id = sp.user_id
      WHERE u.role = 'student' AND u.status = 'active'
        AND (sp.mentor_id = ? OR EXISTS (
          SELECT 1 FROM connections c 
          WHERE ((c.user_a = ? AND c.user_b = u.user_id) OR (c.user_b = ? AND c.user_a = u.user_id)) 
            AND c.status = 'active'
        ))
    `, [mentorId, mentorId, mentorId]);
    const studentsCount = studentsCountRes.rows[0].c || 0;

    // Resources shared by this mentor
    const resourcesRes = await query(`
      SELECT COUNT(*) as c FROM resources WHERE mentor_id = ?
    `, [mentorId]);
    const resourcesShared = resourcesRes.rows[0].c || 0;

    // Recent activity list (recent reviews made by this mentor + recent guidance messages)
    const recentActivity = [];
    
    const recentReviews = (await query(`
      SELECT mr.*, br.sender_id, br.receiver_id,
             sp1.full_name as sender_name, sp2.full_name as receiver_name
      FROM mentor_reviews mr
      JOIN buddy_requests br ON mr.request_id = br.request_id
      LEFT JOIN student_profiles sp1 ON br.sender_id = sp1.user_id
      LEFT JOIN student_profiles sp2 ON br.receiver_id = sp2.user_id
      WHERE mr.mentor_id = ?
      ORDER BY mr.reviewed_at DESC
      LIMIT 5
    `, [mentorId])).rows;

    recentReviews.forEach(r => {
      recentActivity.push({
        id: r.review_id,
        type: 'review',
        text: `Reviewed request between ${r.sender_name} and ${r.receiver_name} (${r.decision})`,
        time: r.reviewed_at
      });
    });

    const recentGuidance = (await query(`
      SELECT * FROM guidance_messages WHERE mentor_id = ? ORDER BY created_at DESC LIMIT 5
    `, [mentorId])).rows;

    recentGuidance.forEach(g => {
      recentActivity.push({
        id: g.guidance_id,
        type: 'guidance',
        text: `Sent guidance message: "${g.subject}"`,
        time: g.created_at
      });
    });

    recentActivity.sort((a, b) => new Date(b.time) - new Date(a.time));

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
// Full queue of flagged buddy requests with details and Reviewed history tab
async function getReviewRequests(req, res) {
  try {
    const mentorId = req.user.userId;

    const pendingRows = (await query(`
      SELECT br.*, 
             COALESCE(br.flag_reason, 'Cross-year / academic gap') as flag_reason,
             s_prof.full_name as sender_name, s_prof.semester as sender_semester, s_prof.year as sender_year,
             s_prog.name as sender_program, s_sch.name as sender_school,
             r_prof.full_name as receiver_name, r_prof.semester as receiver_semester, r_prof.year as receiver_year,
             r_prog.name as receiver_program, r_sch.name as receiver_school
      FROM buddy_requests br
      JOIN student_profiles s_prof ON br.sender_id = s_prof.user_id
      LEFT JOIN programs s_prog ON s_prof.program_id = s_prog.id
      LEFT JOIN schools s_sch ON s_prof.school_id = s_sch.id
      JOIN student_profiles r_prof ON br.receiver_id = r_prof.user_id
      LEFT JOIN programs r_prog ON r_prof.program_id = r_prog.id
      LEFT JOIN schools r_sch ON r_prof.school_id = r_sch.id
      WHERE br.status = 'pending' AND br.needs_mentor_review = 1
      ORDER BY br.created_at ASC
    `)).rows;

    const reviewedRows = (await query(`
      SELECT mr.*, br.note,
             COALESCE(br.flag_reason, 'Cross-year / academic gap') as flag_reason,
             s_prof.full_name as sender_name, s_prof.semester as sender_semester, s_prof.year as sender_year,
             s_prog.name as sender_program,
             r_prof.full_name as receiver_name, r_prof.semester as receiver_semester, r_prof.year as receiver_year,
             r_prog.name as receiver_program
      FROM mentor_reviews mr
      JOIN buddy_requests br ON mr.request_id = br.request_id
      JOIN student_profiles s_prof ON br.sender_id = s_prof.user_id
      LEFT JOIN programs s_prog ON s_prof.program_id = s_prog.id
      JOIN student_profiles r_prof ON br.receiver_id = r_prof.user_id
      LEFT JOIN programs r_prog ON r_prof.program_id = r_prog.id
      WHERE mr.mentor_id = ?
      ORDER BY mr.reviewed_at DESC
    `, [mentorId])).rows;

    return res.json({
      pending: pendingRows,
      reviewed: reviewedRows
    });
  } catch (err) {
    console.error('getReviewRequests error:', err);
    return res.status(500).json({ error: 'Failed to load review requests.' });
  }
}

// GET /api/mentor/my-students
// Strictly returns students allocated to the currently authenticated mentor
async function getMyStudents(req, res) {
  try {
    const mentorId = req.user.userId;
    const { q, schoolId, semester } = req.query;

    let sql = `
      SELECT u.user_id, u.email, sp.full_name, sp.semester, sp.year, sp.bio, sp.school_id, sp.mentor_id,
             p.name as program_name, s.name as school_name, s.code as school_code,
             (SELECT COUNT(*) FROM connections WHERE (user_a = u.user_id OR user_b = u.user_id) AND status = 'active') as active_buddies_count
      FROM users u
      JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      LEFT JOIN schools s ON sp.school_id = s.id
      WHERE u.role = 'student' AND u.status = 'active'
        AND (sp.mentor_id = ? OR EXISTS (
          SELECT 1 FROM connections c 
          WHERE ((c.user_a = ? AND c.user_b = u.user_id) OR (c.user_b = ? AND c.user_a = u.user_id)) 
            AND c.status = 'active'
        ))
    `;
    const params = [mentorId, mentorId, mentorId];

    if (schoolId) {
      sql += ' AND sp.school_id = ?';
      params.push(schoolId);
    }
    if (semester) {
      sql += ' AND sp.semester = ?';
      params.push(parseInt(semester, 10));
    }
    if (q) {
      sql += ' AND (LOWER(sp.full_name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(p.name) LIKE ?)';
      params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
    }

    sql += ' ORDER BY sp.full_name ASC';

    const students = (await query(sql, params)).rows;
    return res.json({ students });
  } catch (err) {
    console.error('getMyStudents error:', err);
    return res.status(500).json({ error: 'Failed to load students.' });
  }
}

// GET /api/mentor/messages
// Guidance messages sent by this mentor
async function getMentorMessages(req, res) {
  try {
    const mentorId = req.user.userId;
    const messages = (await query(`
      SELECT gm.*,
             CASE 
               WHEN gm.target_type = 'student' THEN (SELECT full_name FROM student_profiles WHERE user_id = gm.target_id)
               ELSE NULL 
             END as recipient_name
      FROM guidance_messages gm
      WHERE gm.mentor_id = ?
      ORDER BY gm.created_at DESC
    `, [mentorId])).rows;

    return res.json({ messages });
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
    const { decision, remarks } = req.body; // 'approved' or 'rejected'

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected.' });
    }

    const reqRes = await query('SELECT * FROM buddy_requests WHERE request_id = ?', [requestId]);
    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Buddy request not found.' });
    }

    const reviewId = uuidv4();
    await query(`
      INSERT INTO mentor_reviews (review_id, request_id, mentor_id, decision, remarks)
      VALUES (?, ?, ?, ?, ?)
    `, [reviewId, requestId, mentorId, decision, remarks ? remarks.trim() : null]);

    if (decision === 'approved') {
      // Unflag the request so receiver sees it normally
      await query('UPDATE buddy_requests SET needs_mentor_review = 0 WHERE request_id = ?', [requestId]);
    } else {
      // Reject request directly
      await query(`UPDATE buddy_requests SET status = 'declined', responded_at = datetime('now') WHERE request_id = ?`, [requestId]);
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
      fileUrlOrLink = `/uploads/${req.file.filename}`;
    }

    if (!fileUrlOrLink) {
      return res.status(400).json({ error: 'Either an uploaded file or external resource link is required.' });
    }

    const resourceId = uuidv4();
    await query(`
      INSERT INTO resources (resource_id, mentor_id, title, subject, semester, file_url_or_link, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [resourceId, mentorId, title.trim(), subject.trim(), semester || 1, fileUrlOrLink, description ? description.trim() : null]);

    return res.status(201).json({
      message: 'Resource uploaded successfully.',
      resourceId
    });
  } catch (err) {
    console.error('uploadResource error:', err);
    return res.status(500).json({ error: 'Failed to upload resource.' });
  }
}

// GET /api/mentor/resources
async function getResources(req, res) {
  try {
    const { subject, semester, q } = req.query;

    let sql = `
      SELECT r.*, COALESCE(sp.full_name, stp.full_name, 'Academic Mentor') as uploader_name
      FROM resources r
      LEFT JOIN student_profiles sp ON r.mentor_id = sp.user_id
      LEFT JOIN staff_profiles stp ON r.mentor_id = stp.user_id
      WHERE 1=1
    `;
    const params = [];

    if (subject) {
      sql += ' AND LOWER(r.subject) LIKE ?';
      params.push(`%${subject.toLowerCase()}%`);
    }
    if (semester) {
      sql += ' AND r.semester = ?';
      params.push(parseInt(semester, 10));
    }
    if (q) {
      sql += ' AND (LOWER(r.title) LIKE ? OR LOWER(r.description) LIKE ? OR LOWER(r.subject) LIKE ?)';
      params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
    }

    sql += ' ORDER BY r.uploaded_at DESC';

    const resourcesRes = await query(sql, params);
    return res.json({ resources: resourcesRes.rows });
  } catch (err) {
    console.error('getResources error:', err);
    return res.status(500).json({ error: 'Failed to fetch resources.' });
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
    await query(`
      INSERT INTO guidance_messages (guidance_id, mentor_id, subject, target_type, target_id, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [guidanceId, mentorId, subject || 'General Guidance', targetType, targetId || null, message.trim()]);

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
  sendGuidanceMessage
};

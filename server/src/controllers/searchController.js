const { query } = require('../database/db');

// Calculate match score between two students in-memory
function scoreStudents(studentA, studentB, skillsMap, wantsMap, availMap, weights) {
  let score = 0;
  const reasons = [];

  const skillsA = skillsMap[studentA.user_id] || [];
  const skillsB = skillsMap[studentB.user_id] || [];
  const sharedSkills = skillsA.filter(id => skillsB.includes(id));

  if (sharedSkills.length > 0) {
    const skillBonus = Math.min(weights.skills, sharedSkills.length * 20);
    score += skillBonus;
    reasons.push(`${sharedSkills.length} shared skill(s)`);
  }

  const wantsA = wantsMap[studentA.user_id] || [];
  const wantsB = wantsMap[studentB.user_id] || [];

  const compA = skillsA.filter(id => wantsB.includes(id));
  const compB = skillsB.filter(id => wantsA.includes(id));
  const compTotal = compA.length + compB.length;

  if (compTotal > 0) {
    const compScore = Math.min(weights.complementary, compTotal * 15);
    score += compScore;
    reasons.push('Complementary study goals');
  }

  const availA = availMap[studentA.user_id] || [];
  const availB = availMap[studentB.user_id] || [];

  const overlapDays = [];
  for (const slotA of availA) {
    for (const slotB of availB) {
      if (slotA.day_of_week === slotB.day_of_week) {
        if (!overlapDays.includes(slotA.day_of_week)) {
          overlapDays.push(slotA.day_of_week);
        }
      }
    }
  }

  if (overlapDays.length > 0) {
    const availScore = Math.min(weights.availability, overlapDays.length * 10);
    score += availScore;
    reasons.push(`Free on ${overlapDays.slice(0, 2).join(' & ')}`);
  }

  let schoolSemScore = 0;
  if (studentA.school_id && studentA.school_id === studentB.school_id) {
    schoolSemScore += (weights.school_sem / 2);
  }
  if (studentA.semester && studentA.semester === studentB.semester) {
    schoolSemScore += (weights.school_sem / 2);
  }
  if (schoolSemScore > 0) {
    score += schoolSemScore;
    if (studentA.semester === studentB.semester) reasons.push(`Both in Semester ${studentA.semester}`);
  }

  if (studentB.avg_rating && studentB.avg_rating > 0) {
    const ratingScore = Math.min(weights.rating, (studentB.avg_rating / 5) * weights.rating);
    score += ratingScore;
  }

  return {
    score: Math.min(100, Math.round(score)),
    matchReason: reasons.length > 0 ? reasons.join('; ') : 'Active student open to study partnership'
  };
}

// GET /api/buddies/search
async function searchBuddies(req, res) {
  try {
    const currentUserId = req.user.userId;
    const {
      q,
      schoolId,
      programId,
      semester,
      skillId,
      interestId,
      dayOfWeek,
      studyMode,
      minRating,
      sortBy = 'best_match',
      page = 1,
      limit = 12
    } = req.query;

    const currentUserRes = await query('SELECT * FROM student_profiles WHERE user_id = ?', [currentUserId]);
    const currentStudent = currentUserRes.rows[0] || { user_id: currentUserId };

    const settingsRows = (await query('SELECT key, value FROM settings')).rows;
    const weights = {
      skills: 40,
      complementary: 25,
      availability: 20,
      school_sem: 10,
      rating: 5
    };
    settingsRows.forEach(s => {
      if (s.key === 'weight_skills') weights.skills = parseInt(s.value, 10);
      if (s.key === 'weight_complementary') weights.complementary = parseInt(s.value, 10);
      if (s.key === 'weight_availability') weights.availability = parseInt(s.value, 10);
      if (s.key === 'weight_school_sem') weights.school_sem = parseInt(s.value, 10);
      if (s.key === 'weight_rating') weights.rating = parseInt(s.value, 10);
    });

    let sql = `
      SELECT u.user_id, u.sap_id, u.email, u.last_login,
             sp.full_name, sp.school_id, sp.program_id, sp.semester, sp.year, sp.bio, sp.photo_url, sp.study_mode,
             s.name as school_name, p.name as program_name,
             (
               SELECT AVG((punctuality + helpfulness + communication) / 3.0)
               FROM reviews WHERE reviewee_id = u.user_id
             ) as avg_rating,
             (
               SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.user_id
             ) as review_count
      FROM users u
      JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN schools s ON sp.school_id = s.id
      LEFT JOIN programs p ON sp.program_id = p.id
      WHERE u.role = 'student' 
        AND u.status = 'active'
        AND u.user_id != ?
    `;
    const params = [currentUserId];

    if (schoolId) {
      sql += ' AND sp.school_id = ?';
      params.push(schoolId);
    }
    if (programId) {
      sql += ' AND sp.program_id = ?';
      params.push(programId);
    }
    if (semester) {
      sql += ' AND sp.semester = ?';
      params.push(parseInt(semester, 10));
    }
    if (studyMode && studyMode !== 'all') {
      sql += " AND (sp.study_mode = ? OR sp.study_mode = 'both')";
      params.push(studyMode);
    }

    const baseResults = (await query(sql, params)).rows;

    if (baseResults.length === 0) {
      return res.json({
        buddies: [],
        pagination: { page: 1, limit: parseInt(limit, 10) || 12, total: 0, totalPages: 1 }
      });
    }

    const allUserIds = [currentUserId, ...baseResults.map(s => s.user_id)];

    // Batch load skills, interests, availability, connections, and requests
    const skillsRes = await query(`
      SELECT us.user_id, us.skill_id, us.type, us.level, sk.name
      FROM user_skills us
      JOIN skills sk ON us.skill_id = sk.skill_id
      WHERE us.user_id = ANY(?)
    `, [allUserIds]);

    const interestsRes = await query(`
      SELECT ui.user_id, ui.interest_id, it.name
      FROM user_interests ui
      JOIN interests it ON ui.interest_id = it.interest_id
      WHERE ui.user_id = ANY(?)
    `, [allUserIds]);

    const availRes = await query(`
      SELECT user_id, day_of_week, start_time, end_time
      FROM availability
      WHERE user_id = ANY(?)
    `, [allUserIds]);

    const connsRes = await query(`
      SELECT user_a, user_b FROM connections
      WHERE (user_a = ? OR user_b = ?) AND status = 'active'
    `, [currentUserId, currentUserId]);

    const requestsRes = await query(`
      SELECT sender_id, receiver_id, status FROM buddy_requests
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'pending'
    `, [currentUserId, currentUserId]);

    // Build lookup caches
    const skillsMap = {};
    const wantsMap = {};
    const skillObjsMap = {};
    const interestsMap = {};
    const availMap = {};

    allUserIds.forEach(id => {
      skillsMap[id] = [];
      wantsMap[id] = [];
      skillObjsMap[id] = [];
      interestsMap[id] = [];
      availMap[id] = [];
    });

    skillsRes.rows.forEach(r => {
      if (r.type === 'has') {
        skillsMap[r.user_id].push(r.skill_id);
        skillObjsMap[r.user_id].push(r);
      } else {
        wantsMap[r.user_id].push(r.skill_id);
      }
    });

    interestsRes.rows.forEach(r => {
      interestsMap[r.user_id].push(r);
    });

    availRes.rows.forEach(r => {
      availMap[r.user_id].push(r);
    });

    const activePartners = new Set();
    connsRes.rows.forEach(c => {
      activePartners.add(c.user_a === currentUserId ? c.user_b : c.user_a);
    });

    const pendingReqMap = {};
    requestsRes.rows.forEach(r => {
      const partner = r.sender_id === currentUserId ? r.receiver_id : r.sender_id;
      pendingReqMap[partner] = { isOutgoing: r.sender_id === currentUserId };
    });

    let results = [];
    for (const student of baseResults) {
      const studentSkills = skillObjsMap[student.user_id] || [];
      const studentInterests = interestsMap[student.user_id] || [];
      const studentAvail = availMap[student.user_id] || [];
      const days = [...new Set(studentAvail.map(a => a.day_of_week))];

      if (q && q.trim()) {
        const queryTerm = q.trim().toLowerCase();
        const matchesName = student.full_name && student.full_name.toLowerCase().includes(queryTerm);
        const matchesSap = student.sap_id && student.sap_id.includes(queryTerm);
        const matchesSem = student.semester && (`semester ${student.semester}`.includes(queryTerm) || String(student.semester) === queryTerm);
        const matchesSkill = studentSkills.some(sk => sk.name.toLowerCase().includes(queryTerm));
        const matchesInterest = studentInterests.some(it => it.name.toLowerCase().includes(queryTerm));
        if (!matchesName && !matchesSap && !matchesSem && !matchesSkill && !matchesInterest) {
          continue;
        }
      }

      if (skillId && !studentSkills.some(s => s.skill_id === skillId)) {
        continue;
      }

      if (interestId && !studentInterests.some(it => it.interest_id === interestId)) {
        continue;
      }

      if (dayOfWeek && !days.includes(dayOfWeek)) {
        continue;
      }

      const rating = student.review_count >= 3 ? parseFloat(student.avg_rating) : null;
      if (minRating && (rating === null || rating < parseFloat(minRating))) {
        continue;
      }

      const isConnected = activePartners.has(student.user_id);
      const pendingRequest = pendingReqMap[student.user_id] || null;

      const { score, matchReason } = scoreStudents(currentStudent, student, skillsMap, wantsMap, availMap, weights);

      results.push({
        userId: student.user_id,
        sapId: student.sap_id,
        fullName: student.full_name,
        photoUrl: student.photo_url,
        schoolName: student.school_name,
        programName: student.program_name,
        semester: student.semester,
        year: student.year,
        studyMode: student.study_mode,
        rating: rating ? rating.toFixed(1) : null,
        reviewCount: student.review_count,
        skills: studentSkills.slice(0, 3),
        availableDays: days.slice(0, 3).join(', '),
        matchPercentage: score,
        matchReason,
        isConnected,
        pendingRequest,
        lastLogin: student.last_login
      });
    }

    if (sortBy === 'highest_rating') {
      results.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    } else if (sortBy === 'recently_active') {
      results.sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));
    } else {
      results.sort((a, b) => b.matchPercentage - a.matchPercentage);
    }

    const pageNum = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 12;
    const total = results.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const paginated = results.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    return res.json({
      buddies: paginated,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages
      }
    });
  } catch (err) {
    console.error('searchBuddies error:', err);
    return res.status(500).json({ error: 'Failed to search buddies.' });
  }
}

// GET /api/buddies/suggested
async function getSuggestedBuddies(req, res) {
  try {
    const currentUserId = req.user.userId;

    const currentUserRes = await query('SELECT * FROM student_profiles WHERE user_id = ?', [currentUserId]);
    const currentStudent = currentUserRes.rows[0] || { user_id: currentUserId };

    const candidates = (await query(`
      SELECT u.user_id, u.email, sp.full_name, sp.school_id, sp.program_id, sp.semester, sp.photo_url,
             p.name as program_name,
             (SELECT AVG((punctuality + helpfulness + communication) / 3.0) FROM reviews WHERE reviewee_id = u.user_id) as avg_rating,
             (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.user_id) as review_count
      FROM users u
      JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      WHERE u.role = 'student' 
        AND u.status = 'active'
        AND u.user_id != ?
        AND sp.open_to_requests = 1
        AND u.user_id NOT IN (
          SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END
          FROM connections WHERE (user_a = ? OR user_b = ?) AND status = 'active'
        )
    `, [currentUserId, currentUserId, currentUserId, currentUserId])).rows;

    if (candidates.length === 0) {
      return res.json({ suggestions: [] });
    }

    const allUserIds = [currentUserId, ...candidates.map(c => c.user_id)];

    const skillsRes = await query(`
      SELECT us.user_id, us.skill_id, us.type, sk.name
      FROM user_skills us
      JOIN skills sk ON us.skill_id = sk.skill_id
      WHERE us.user_id = ANY(?)
    `, [allUserIds]);

    const availRes = await query(`
      SELECT user_id, day_of_week, start_time, end_time
      FROM availability
      WHERE user_id = ANY(?)
    `, [allUserIds]);

    const skillsMap = {};
    const wantsMap = {};
    const skillNamesMap = {};
    const availMap = {};

    allUserIds.forEach(id => {
      skillsMap[id] = [];
      wantsMap[id] = [];
      skillNamesMap[id] = [];
      availMap[id] = [];
    });

    skillsRes.rows.forEach(r => {
      if (r.type === 'has') {
        skillsMap[r.user_id].push(r.skill_id);
        skillNamesMap[r.user_id].push(r.name);
      } else {
        wantsMap[r.user_id].push(r.skill_id);
      }
    });

    availRes.rows.forEach(r => {
      availMap[r.user_id].push(r);
    });

    const weights = { skills: 40, complementary: 25, availability: 20, school_sem: 10, rating: 5 };
    const suggestions = [];

    for (const cand of candidates) {
      const { score, matchReason } = scoreStudents(currentStudent, cand, skillsMap, wantsMap, availMap, weights);
      const rating = cand.review_count >= 3 ? parseFloat(cand.avg_rating).toFixed(1) : null;
      const skills = (skillNamesMap[cand.user_id] || []).slice(0, 2);

      suggestions.push({
        userId: cand.user_id,
        fullName: cand.full_name,
        photoUrl: cand.photo_url,
        programName: cand.program_name,
        semester: cand.semester,
        rating,
        sharedSkills: skills,
        matchPercentage: score,
        matchReason
      });
    }

    suggestions.sort((a, b) => b.matchPercentage - a.matchPercentage);
    return res.json({ suggestions: suggestions.slice(0, 5) });
  } catch (err) {
    console.error('getSuggestedBuddies error:', err);
    return res.status(500).json({ error: 'Failed to load suggestions.' });
  }
}

module.exports = {
  searchBuddies,
  getSuggestedBuddies
};

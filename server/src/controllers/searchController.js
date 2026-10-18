const { query } = require('../database/db');

// Calculate match score between two students according to doc:
// Shared skills and subjects: 40
// Complementary needs (one can help, other wants to learn): 25
// Overlapping availability: 20
// Same school or semester: 10
// Rating: 5
async function calculateMatchScore(studentA, studentB, weights) {
  let score = 0;
  const reasons = [];

  // 1. Shared Skills (type = 'has')
  const skillsA = (await query('SELECT skill_id FROM user_skills WHERE user_id = ? AND type = "has"', [studentA.user_id])).rows.map(r => r.skill_id);
  const skillsB = (await query('SELECT skill_id FROM user_skills WHERE user_id = ? AND type = "has"', [studentB.user_id])).rows.map(r => r.skill_id);
  const sharedSkills = skillsA.filter(id => skillsB.includes(id));

  if (sharedSkills.length > 0) {
    const skillBonus = Math.min(weights.skills, sharedSkills.length * 20);
    score += skillBonus;
    reasons.push(`${sharedSkills.length} shared skill(s)`);
  }

  // 2. Complementary Needs: A has what B wants, or B has what A wants
  const wantsA = (await query('SELECT skill_id FROM user_skills WHERE user_id = ? AND type = "wants_to_learn"', [studentA.user_id])).rows.map(r => r.skill_id);
  const wantsB = (await query('SELECT skill_id FROM user_skills WHERE user_id = ? AND type = "wants_to_learn"', [studentB.user_id])).rows.map(r => r.skill_id);

  const compA = skillsA.filter(id => wantsB.includes(id));
  const compB = skillsB.filter(id => wantsA.includes(id));
  const compTotal = compA.length + compB.length;

  if (compTotal > 0) {
    const compScore = Math.min(weights.complementary, compTotal * 15);
    score += compScore;
    reasons.push('Complementary study goals');
  }

  // 3. Overlapping Availability
  const availA = (await query('SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = ?', [studentA.user_id])).rows;
  const availB = (await query('SELECT day_of_week, start_time, end_time FROM availability WHERE user_id = ?', [studentB.user_id])).rows;

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

  // 4. Same School or Semester
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

  // 5. Rating weight
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
      q, // keyword: name, skill, interest
      schoolId,
      programId,
      semester,
      skillId,
      interestId,
      dayOfWeek,
      studyMode,
      minRating,
      sortBy = 'best_match', // best_match, highest_rating, recently_active
      page = 1,
      limit = 12
    } = req.query;

    // Get current user profile for matching
    const currentUserRes = await query('SELECT * FROM student_profiles WHERE user_id = ?', [currentUserId]);
    const currentStudent = currentUserRes.rows[0] || { user_id: currentUserId };

    // Get weights from settings
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

    // Query active students who are open to requests, excluding self
    let sql = `
      SELECT u.user_id, u.email, u.last_login,
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
        AND sp.open_to_requests = 1
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
      sql += ' AND (sp.study_mode = ? OR sp.study_mode = "both")';
      params.push(studyMode);
    }

    const baseResults = (await query(sql, params)).rows;

    // Filter and compute match score for each student
    let results = [];
    for (const student of baseResults) {
      // Get skills
      const studentSkills = (await query(`
        SELECT sk.skill_id, sk.name, us.type, us.level
        FROM user_skills us
        JOIN skills sk ON us.skill_id = sk.skill_id
        WHERE us.user_id = ?
      `, [student.user_id])).rows;

      // Get interests
      const studentInterests = (await query(`
        SELECT it.interest_id, it.name
        FROM user_interests ui
        JOIN interests it ON ui.interest_id = it.interest_id
        WHERE ui.user_id = ?
      `, [student.user_id])).rows;

      // Get availability days
      const availabilitySlots = (await query('SELECT DISTINCT day_of_week FROM availability WHERE user_id = ?', [student.user_id])).rows;
      const days = availabilitySlots.map(a => a.day_of_week);

      // Keyword filter: check name, skills, interests
      if (q && q.trim()) {
        const queryTerm = q.trim().toLowerCase();
        const matchesName = student.full_name && student.full_name.toLowerCase().includes(queryTerm);
        const matchesSkill = studentSkills.some(sk => sk.name.toLowerCase().includes(queryTerm));
        const matchesInterest = studentInterests.some(it => it.name.toLowerCase().includes(queryTerm));
        if (!matchesName && !matchesSkill && !matchesInterest) {
          continue;
        }
      }

      // Skill filter
      if (skillId && !studentSkills.some(s => s.skill_id === skillId)) {
        continue;
      }

      // Interest filter
      if (interestId && !studentInterests.some(it => it.interest_id === interestId)) {
        continue;
      }

      // Day of week filter
      if (dayOfWeek && !days.includes(dayOfWeek)) {
        continue;
      }

      // Minimum rating filter
      const rating = student.review_count >= 3 ? parseFloat(student.avg_rating) : null;
      if (minRating && (rating === null || rating < parseFloat(minRating))) {
        continue;
      }

      // Check existing connection or pending request status
      const connRes = await query(`
        SELECT connection_id FROM connections
        WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?) AND status = 'active'
      `, [currentUserId, student.user_id, student.user_id, currentUserId]);
      const isConnected = connRes.rowCount > 0;

      const reqRes = await query(`
        SELECT status, sender_id FROM buddy_requests
        WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
          AND status = 'pending'
      `, [currentUserId, student.user_id, student.user_id, currentUserId]);
      const pendingRequest = reqRes.rowCount > 0 ? reqRes.rows[0] : null;

      // Calculate match score
      const { score, matchReason } = await calculateMatchScore(currentStudent, student, weights);

      results.push({
        userId: student.user_id,
        fullName: student.full_name,
        photoUrl: student.photo_url,
        schoolName: student.school_name,
        programName: student.program_name,
        semester: student.semester,
        year: student.year,
        studyMode: student.study_mode,
        rating: rating ? rating.toFixed(1) : null,
        reviewCount: student.review_count,
        skills: studentSkills.filter(s => s.type === 'has').slice(0, 3),
        availableDays: days.slice(0, 3).join(', '),
        matchPercentage: score,
        matchReason,
        isConnected,
        pendingRequest: pendingRequest ? {
          isOutgoing: pendingRequest.sender_id === currentUserId
        } : null,
        lastLogin: student.last_login
      });
    }

    // Sort results
    if (sortBy === 'highest_rating') {
      results.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    } else if (sortBy === 'recently_active') {
      results.sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));
    } else {
      // Default: best_match
      results.sort((a, b) => b.matchPercentage - a.matchPercentage);
    }

    // Pagination (12 results per page from doc)
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

    const weights = { skills: 40, complementary: 25, availability: 20, school_sem: 10, rating: 5 };
    const suggestions = [];

    for (const cand of candidates) {
      const skills = (await query(`
        SELECT sk.name FROM user_skills us JOIN skills sk ON us.skill_id = sk.skill_id
        WHERE us.user_id = ? AND us.type = 'has' LIMIT 2
      `, [cand.user_id])).rows.map(s => s.name);

      const { score, matchReason } = await calculateMatchScore(currentStudent, cand, weights);
      const rating = cand.review_count >= 3 ? parseFloat(cand.avg_rating).toFixed(1) : null;

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

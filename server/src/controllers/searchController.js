const {
  COLLECTIONS,
  getDoc,
  queryDocs,
  getAllDocs
} = require('../database/firestoreDb');

// Calculate match score between two students in-memory
function scoreStudents(studentA, studentB, skillsMap, wantsMap, availMap, weights) {
  let score = 0;
  const reasons = [];

  const idA = studentA.user_id || studentA.id;
  const idB = studentB.user_id || studentB.id;

  const skillsA = skillsMap[idA] || [];
  const skillsB = skillsMap[idB] || [];
  const sharedSkills = skillsA.filter(id => skillsB.includes(id));

  if (sharedSkills.length > 0) {
    const skillBonus = Math.min(weights.skills, sharedSkills.length * 20);
    score += skillBonus;
    reasons.push(`${sharedSkills.length} shared skill(s)`);
  }

  const wantsA = wantsMap[idA] || [];
  const wantsB = wantsMap[idB] || [];

  const compA = skillsA.filter(id => wantsB.includes(id));
  const compB = skillsB.filter(id => wantsA.includes(id));
  const compTotal = compA.length + compB.length;

  if (compTotal > 0) {
    const compScore = Math.min(weights.complementary, compTotal * 15);
    score += compScore;
    reasons.push('Complementary study goals');
  }

  const availA = availMap[idA] || [];
  const availB = availMap[idB] || [];

  const overlapDays = [];
  for (const slotA of availA) {
    for (const slotB of availB) {
      const dayA = slotA.day_of_week || slotA.dayOfWeek;
      const dayB = slotB.day_of_week || slotB.dayOfWeek;
      if (dayA && dayA === dayB) {
        if (!overlapDays.includes(dayA)) {
          overlapDays.push(dayA);
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

  if (studentB.avg_rating && Number(studentB.avg_rating) > 0) {
    const ratingScore = Math.min(weights.rating, (Number(studentB.avg_rating) / 5) * weights.rating);
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

    const currentStudent = await getDoc(COLLECTIONS.STUDENT_PROFILES, currentUserId) || { user_id: currentUserId };

    const settingsList = await getAllDocs(COLLECTIONS.SETTINGS);
    const weights = {
      skills: 40,
      complementary: 25,
      availability: 20,
      school_sem: 10,
      rating: 5
    };
    settingsList.forEach(s => {
      if (s.key === 'weight_skills') weights.skills = parseInt(s.value, 10);
      if (s.key === 'weight_complementary') weights.complementary = parseInt(s.value, 10);
      if (s.key === 'weight_availability') weights.availability = parseInt(s.value, 10);
      if (s.key === 'weight_school_sem') weights.school_sem = parseInt(s.value, 10);
      if (s.key === 'weight_rating') weights.rating = parseInt(s.value, 10);
    });

    const studentUsers = await queryDocs(COLLECTIONS.USERS, [
      ['role', '==', 'student'],
      ['status', '==', 'active']
    ]);

    const schools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const schoolMap = new Map(schools.map(s => [s.id, s.name]));
    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p.name]));
    const allSkills = await getAllDocs(COLLECTIONS.SKILLS);
    const skillNameMap = new Map(allSkills.map(s => [s.skill_id || s.id, s.name]));
    const allInterests = await getAllDocs(COLLECTIONS.INTERESTS);
    const interestNameMap = new Map(allInterests.map(i => [i.interest_id || i.id, i.name]));

    const allUserSkills = await getAllDocs(COLLECTIONS.USER_SKILLS);
    const allUserInterests = await getAllDocs(COLLECTIONS.USER_INTERESTS);
    const allAvailability = await getAllDocs(COLLECTIONS.AVAILABILITY);
    const allReviews = await getAllDocs(COLLECTIONS.REVIEWS);
    const allConns = await getAllDocs(COLLECTIONS.CONNECTIONS);
    const allRequests = await getAllDocs(COLLECTIONS.BUDDY_REQUESTS);

    // Active connections for current user
    const activePartners = new Set();
    allConns.filter(c => c.status === 'active').forEach(c => {
      if (c.user_a === currentUserId) activePartners.add(c.user_b);
      if (c.user_b === currentUserId) activePartners.add(c.user_a);
    });

    // Pending requests for current user
    const pendingReqMap = {};
    allRequests.filter(r => r.status === 'pending').forEach(r => {
      if (r.sender_id === currentUserId) {
        pendingReqMap[r.receiver_id] = { isOutgoing: true };
      } else if (r.receiver_id === currentUserId) {
        pendingReqMap[r.sender_id] = { isOutgoing: false };
      }
    });

    // Build skill/interest/avail maps
    const skillsMap = {};
    const wantsMap = {};
    const skillObjsMap = {};
    const interestsMap = {};
    const availMap = {};

    allUserSkills.forEach(r => {
      const uId = r.user_id;
      if (!skillsMap[uId]) skillsMap[uId] = [];
      if (!wantsMap[uId]) wantsMap[uId] = [];
      if (!skillObjsMap[uId]) skillObjsMap[uId] = [];

      const skName = skillNameMap.get(r.skill_id) || 'Skill';
      if (r.type === 'has') {
        skillsMap[uId].push(r.skill_id);
        skillObjsMap[uId].push({ ...r, name: skName });
      } else {
        wantsMap[uId].push(r.skill_id);
      }
    });

    allUserInterests.forEach(r => {
      const uId = r.user_id;
      if (!interestsMap[uId]) interestsMap[uId] = [];
      const itName = interestNameMap.get(r.interest_id) || 'Interest';
      interestsMap[uId].push({ ...r, name: itName });
    });

    allAvailability.forEach(r => {
      const uId = r.user_id;
      if (!availMap[uId]) availMap[uId] = [];
      availMap[uId].push(r);
    });

    // Reviews by reviewee
    const reviewsMap = {};
    allReviews.forEach(r => {
      const rId = r.reviewee_id;
      if (!reviewsMap[rId]) reviewsMap[rId] = [];
      reviewsMap[rId].push(r);
    });

    const candidates = [];
    for (const u of studentUsers) {
      if (u.user_id === currentUserId) continue;

      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, u.user_id);
      if (!sp) continue;

      if (schoolId && sp.school_id !== schoolId) continue;
      if (programId && sp.program_id !== programId) continue;
      if (semester && Number(sp.semester) !== parseInt(semester, 10)) continue;
      if (studyMode && studyMode !== 'all') {
        if (sp.study_mode !== studyMode && sp.study_mode !== 'both') continue;
      }

      const revList = reviewsMap[u.user_id] || [];
      const reviewCount = revList.length;
      let avgRating = 0;
      if (reviewCount > 0) {
        const sum = revList.reduce((acc, r) => acc + (((Number(r.punctuality) || 0) + (Number(r.helpfulness) || 0) + (Number(r.communication) || 0)) / 3.0), 0);
        avgRating = sum / reviewCount;
      }

      candidates.push({
        user_id: u.user_id,
        sap_id: u.sap_id,
        email: u.email,
        last_login: u.last_login,
        full_name: sp.full_name || 'Student',
        school_id: sp.school_id,
        program_id: sp.program_id,
        semester: sp.semester,
        year: sp.year,
        bio: sp.bio,
        photo_url: sp.photo_url,
        study_mode: sp.study_mode,
        school_name: sp.school_id ? (schoolMap.get(sp.school_id) || null) : null,
        program_name: sp.program_id ? (progMap.get(sp.program_id) || null) : null,
        avg_rating: avgRating,
        review_count: reviewCount
      });
    }

    let results = [];
    for (const student of candidates) {
      const studentSkills = skillObjsMap[student.user_id] || [];
      const studentInterests = interestsMap[student.user_id] || [];
      const studentAvail = availMap[student.user_id] || [];
      const days = [...new Set(studentAvail.map(a => a.day_of_week || a.dayOfWeek).filter(Boolean))];

      if (q && q.trim()) {
        const queryTerm = q.trim().toLowerCase();
        const matchesName = student.full_name && student.full_name.toLowerCase().includes(queryTerm);
        const matchesSap = student.sap_id && String(student.sap_id).includes(queryTerm);
        const matchesSem = student.semester && (`semester ${student.semester}`.includes(queryTerm) || String(student.semester) === queryTerm);
        const matchesSkill = studentSkills.some(sk => sk.name && sk.name.toLowerCase().includes(queryTerm));
        const matchesInterest = studentInterests.some(it => it.name && it.name.toLowerCase().includes(queryTerm));
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
    const currentStudent = await getDoc(COLLECTIONS.STUDENT_PROFILES, currentUserId) || { user_id: currentUserId };

    const studentUsers = await queryDocs(COLLECTIONS.USERS, [
      ['role', '==', 'student'],
      ['status', '==', 'active']
    ]);

    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p.name]));
    const allSkills = await getAllDocs(COLLECTIONS.SKILLS);
    const skillNameMap = new Map(allSkills.map(s => [s.skill_id || s.id, s.name]));

    const allUserSkills = await getAllDocs(COLLECTIONS.USER_SKILLS);
    const allAvailability = await getAllDocs(COLLECTIONS.AVAILABILITY);
    const allReviews = await getAllDocs(COLLECTIONS.REVIEWS);
    const allConns = await getAllDocs(COLLECTIONS.CONNECTIONS);
    const allRequests = await getAllDocs(COLLECTIONS.BUDDY_REQUESTS);

    // Active connection buddies
    const connectedBuddies = new Set();
    allConns.filter(c => c.status === 'active').forEach(c => {
      if (c.user_a === currentUserId) connectedBuddies.add(c.user_b);
      if (c.user_b === currentUserId) connectedBuddies.add(c.user_a);
    });

    // Pending request buddies (outgoing or incoming)
    const pendingWithUser = new Set();
    allRequests.filter(r => r.status === 'pending').forEach(r => {
      if (r.sender_id === currentUserId) pendingWithUser.add(r.receiver_id);
      if (r.receiver_id === currentUserId) pendingWithUser.add(r.sender_id);
    });

    const skillsMap = {};
    const wantsMap = {};
    const skillNamesMap = {};
    const availMap = {};

    allUserSkills.forEach(r => {
      const uId = r.user_id;
      if (!skillsMap[uId]) skillsMap[uId] = [];
      if (!wantsMap[uId]) wantsMap[uId] = [];
      if (!skillNamesMap[uId]) skillNamesMap[uId] = [];

      const name = skillNameMap.get(r.skill_id) || 'Skill';
      if (r.type === 'has') {
        skillsMap[uId].push(r.skill_id);
        skillNamesMap[uId].push(name);
      } else {
        wantsMap[uId].push(r.skill_id);
      }
    });

    allAvailability.forEach(r => {
      const uId = r.user_id;
      if (!availMap[uId]) availMap[uId] = [];
      availMap[uId].push(r);
    });

    const reviewsMap = {};
    allReviews.forEach(r => {
      const rId = r.reviewee_id;
      if (!reviewsMap[rId]) reviewsMap[rId] = [];
      reviewsMap[rId].push(r);
    });

    const weights = { skills: 40, complementary: 25, availability: 20, school_sem: 10, rating: 5 };
    const suggestions = [];

    for (const u of studentUsers) {
      if (u.user_id === currentUserId) continue;
      if (connectedBuddies.has(u.user_id)) continue;
      if (pendingWithUser.has(u.user_id)) continue;

      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, u.user_id);
      if (!sp) continue;
      if (sp.open_to_requests === 0 || sp.open_to_requests === false) continue;

      const cand = {
        user_id: u.user_id,
        email: u.email,
        full_name: sp.full_name || 'Student',
        school_id: sp.school_id,
        program_id: sp.program_id,
        semester: sp.semester,
        photo_url: sp.photo_url,
        program_name: sp.program_id ? (progMap.get(sp.program_id) || null) : null
      };

      const revList = reviewsMap[u.user_id] || [];
      const reviewCount = revList.length;
      let avgRating = 0;
      if (reviewCount > 0) {
        const sum = revList.reduce((acc, r) => acc + (((Number(r.punctuality) || 0) + (Number(r.helpfulness) || 0) + (Number(r.communication) || 0)) / 3.0), 0);
        avgRating = sum / reviewCount;
      }
      cand.avg_rating = avgRating;
      cand.review_count = reviewCount;

      const { score, matchReason } = scoreStudents(currentStudent, cand, skillsMap, wantsMap, availMap, weights);
      const rating = reviewCount >= 3 ? avgRating.toFixed(1) : null;
      const skills = (skillNamesMap[u.user_id] || []).slice(0, 2);

      suggestions.push({
        userId: u.user_id,
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

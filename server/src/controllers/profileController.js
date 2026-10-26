const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteWhere,
  queryDocs,
  getAllDocs,
  countDocs,
  nowISO,
  getBatch
} = require('../database/firestoreDb');

// Calculate profile completeness score (0 to 100)
function calculateCompleteness(profile, skillsCount, interestsCount, availabilityCount) {
  let score = 20; // base for registration
  if (profile && profile.full_name) score += 10;
  if (profile && profile.bio && profile.bio.trim().length > 10) score += 15;
  if (profile && profile.school_id && profile.program_id) score += 15;
  if (skillsCount > 0) score += 20;
  if (interestsCount > 0) score += 10;
  if (availabilityCount > 0) score += 10;
  return Math.min(100, score);
}

// GET /api/profile/:userId?
async function getProfile(req, res) {
  try {
    const targetUserId = req.params.userId || req.user.userId;
    const isOwner = req.user.userId === targetUserId;

    const user = await getDoc(COLLECTIONS.USERS, targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.role === 'student') {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, targetUserId) || {};

      let schoolName = null;
      if (sp.school_id) {
        const sch = await getDoc(COLLECTIONS.SCHOOLS, sp.school_id);
        if (sch) schoolName = sch.name;
      }

      let programName = null;
      if (sp.program_id) {
        const prog = await getDoc(COLLECTIONS.PROGRAMS, sp.program_id);
        if (prog) programName = prog.name;
      }

      const profile = {
        ...sp,
        school_name: schoolName,
        program_name: programName
      };

      // Skills
      const userSkills = await queryDocs(COLLECTIONS.USER_SKILLS, [['user_id', '==', targetUserId]]);
      const skills = [];
      for (const us of userSkills) {
        const sk = us.skill_id ? await getDoc(COLLECTIONS.SKILLS, us.skill_id) : null;
        skills.push({
          id: us.id,
          skill_id: us.skill_id,
          type: us.type,
          level: us.level,
          name: sk ? sk.name : 'Unknown Skill',
          category: sk ? sk.category : 'General',
          approved: sk ? sk.approved : 1
        });
      }

      // Interests
      const userInterests = await queryDocs(COLLECTIONS.USER_INTERESTS, [['user_id', '==', targetUserId]]);
      const interests = [];
      for (const ui of userInterests) {
        const it = ui.interest_id ? await getDoc(COLLECTIONS.INTERESTS, ui.interest_id) : null;
        interests.push({
          id: ui.id,
          interest_id: ui.interest_id,
          name: it ? it.name : 'Unknown Interest',
          category: it ? it.category : 'General'
        });
      }

      // Availability
      let availability = [];
      if (isOwner || sp.show_availability) {
        availability = await queryDocs(COLLECTIONS.AVAILABILITY, [['user_id', '==', targetUserId]]);
        availability.sort((a, b) => {
          const dayCompare = (a.day_of_week || '').localeCompare(b.day_of_week || '');
          if (dayCompare !== 0) return dayCompare;
          return (a.start_time || '').localeCompare(b.start_time || '');
        });
      }

      // Reviews summary
      const reviews = await queryDocs(COLLECTIONS.REVIEWS, [['reviewee_id', '==', targetUserId]]);
      const reviewCount = reviews.length;

      let avgPunctuality = 0;
      let avgHelpfulness = 0;
      let avgCommunication = 0;
      let overallRating = null;

      if (reviewCount > 0) {
        let sumP = 0, sumH = 0, sumC = 0, sumOverall = 0;
        reviews.forEach(r => {
          const p = Number(r.punctuality) || 0;
          const h = Number(r.helpfulness) || 0;
          const c = Number(r.communication) || 0;
          sumP += p;
          sumH += h;
          sumC += c;
          sumOverall += (p + h + c) / 3.0;
        });
        avgPunctuality = (sumP / reviewCount).toFixed(1);
        avgHelpfulness = (sumH / reviewCount).toFixed(1);
        avgCommunication = (sumC / reviewCount).toFixed(1);
        if (reviewCount >= 3) {
          overallRating = (sumOverall / reviewCount).toFixed(1);
        }
      }

      // Recent reviews list
      reviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const recentReviews = [];
      for (const r of reviews.slice(0, 5)) {
        const reviewerProf = r.reviewer_id ? await getDoc(COLLECTIONS.STUDENT_PROFILES, r.reviewer_id) : null;
        recentReviews.push({
          review_id: r.review_id || r.id,
          punctuality: r.punctuality,
          helpfulness: r.helpfulness,
          communication: r.communication,
          comment: r.comment,
          created_at: r.created_at,
          reviewer_name: reviewerProf ? reviewerProf.full_name : 'Peer Student'
        });
      }

      const displayEmail = (isOwner || sp.show_email) ? user.email : null;

      return res.json({
        user: {
          userId: user.user_id || user.id,
          role: user.role,
          email: displayEmail,
          sapId: isOwner ? user.sap_id : null
        },
        profile,
        skills,
        interests,
        availability,
        reviewsCount: reviewCount,
        overallRating,
        ratingDetails: reviewCount >= 3 ? {
          punctuality: avgPunctuality,
          helpfulness: avgHelpfulness,
          communication: avgCommunication
        } : null,
        recentReviews,
        isOwner
      });
    } else {
      // Staff profile
      const staffProf = await getDoc(COLLECTIONS.STAFF_PROFILES, targetUserId) || {};
      return res.json({
        user: {
          userId: user.user_id || user.id,
          role: user.role,
          email: user.email
        },
        profile: staffProf,
        isOwner
      });
    }
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
}

// PUT /api/profile
async function updateProfile(req, res) {
  try {
    const userId = req.user.userId;
    const {
      fullName,
      bio,
      schoolId,
      programId,
      semester,
      year,
      studyMode,
      openToRequests,
      showEmail,
      showAvailability,
      photoUrl,
      department,
      designation,
      expertise,
      skills,
      interests,
      availability
    } = req.body;

    if (req.user.role === 'student') {
      if (bio && bio.length > 250) {
        return res.status(400).json({ error: 'Bio must be at most 250 characters.' });
      }

      const cleanSchoolId = (schoolId && String(schoolId).trim()) ? String(schoolId).trim() : null;
      const cleanProgramId = (programId && String(programId).trim()) ? String(programId).trim() : null;
      const cleanFullName = (fullName !== undefined && String(fullName).trim()) ? String(fullName).trim() : null;
      const cleanBio = (bio !== undefined && String(bio).trim()) ? String(bio).trim() : null;
      const cleanStudyMode = studyMode || null;
      const cleanPhotoUrl = (photoUrl && String(photoUrl).trim()) ? String(photoUrl).trim() : null;
      const cleanSemester = (semester !== undefined && semester !== null && semester !== '') ? parseInt(semester, 10) : null;
      const cleanYear = (year !== undefined && year !== null && year !== '') ? parseInt(year, 10) : null;
      const cleanOpenToReq = openToRequests !== undefined ? (openToRequests ? 1 : 0) : null;
      const cleanShowEmail = showEmail !== undefined ? (showEmail ? 1 : 0) : null;
      const cleanShowAvail = showAvailability !== undefined ? (showAvailability ? 1 : 0) : null;

      const existingProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, userId);

      const profileData = {
        user_id: userId,
        full_name: cleanFullName !== null ? cleanFullName : (existingProf?.full_name || 'Student'),
        school_id: cleanSchoolId !== null ? cleanSchoolId : (existingProf?.school_id || null),
        program_id: cleanProgramId !== null ? cleanProgramId : (existingProf?.program_id || null),
        semester: cleanSemester !== null ? cleanSemester : (existingProf?.semester || 1),
        year: cleanYear !== null ? cleanYear : (existingProf?.year || 1),
        bio: cleanBio !== null ? cleanBio : (existingProf?.bio || null),
        study_mode: cleanStudyMode !== null ? cleanStudyMode : (existingProf?.study_mode || 'both'),
        open_to_requests: cleanOpenToReq !== null ? cleanOpenToReq : (existingProf?.open_to_requests ?? 1),
        show_email: cleanShowEmail !== null ? cleanShowEmail : (existingProf?.show_email ?? 0),
        show_availability: cleanShowAvail !== null ? cleanShowAvail : (existingProf?.show_availability ?? 1),
        photo_url: cleanPhotoUrl !== null ? cleanPhotoUrl : (existingProf?.photo_url || null)
      };

      await setDoc(COLLECTIONS.STUDENT_PROFILES, userId, profileData);

      // Update skills
      if (Array.isArray(skills)) {
        await deleteWhere(COLLECTIONS.USER_SKILLS, 'user_id', '==', userId);
        for (const s of skills) {
          const sId = s.skillId || s.skill_id;
          if (sId) {
            const userSkillId = uuidv4();
            await setDoc(COLLECTIONS.USER_SKILLS, userSkillId, {
              id: userSkillId,
              user_id: userId,
              skill_id: sId,
              type: s.type || 'has',
              level: s.level || 'intermediate'
            });
          }
        }
      }

      // Update interests
      if (Array.isArray(interests)) {
        await deleteWhere(COLLECTIONS.USER_INTERESTS, 'user_id', '==', userId);
        for (const intId of interests) {
          const actualId = typeof intId === 'object' ? (intId.interest_id || intId.interestId) : intId;
          if (actualId) {
            const userIntId = uuidv4();
            await setDoc(COLLECTIONS.USER_INTERESTS, userIntId, {
              id: userIntId,
              user_id: userId,
              interest_id: actualId
            });
          }
        }
      }

      // Update availability
      if (Array.isArray(availability)) {
        await deleteWhere(COLLECTIONS.AVAILABILITY, 'user_id', '==', userId);
        for (const slot of availability) {
          const day = slot.dayOfWeek || slot.day_of_week;
          const start = slot.startTime || slot.start_time;
          const end = slot.endTime || slot.end_time;
          if (day && start && end) {
            const availId = uuidv4();
            await setDoc(COLLECTIONS.AVAILABILITY, availId, {
              availability_id: availId,
              id: availId,
              user_id: userId,
              day_of_week: day,
              start_time: start,
              end_time: end
            });
          }
        }
      }

      // Re-calculate completeness
      const skCount = await countDocs(COLLECTIONS.USER_SKILLS, [['user_id', '==', userId]]);
      const itCount = await countDocs(COLLECTIONS.USER_INTERESTS, [['user_id', '==', userId]]);
      const avCount = await countDocs(COLLECTIONS.AVAILABILITY, [['user_id', '==', userId]]);

      const completeness = calculateCompleteness(profileData, skCount, itCount, avCount);
      await updateDoc(COLLECTIONS.STUDENT_PROFILES, userId, { profile_completeness: completeness });

      return res.json({ message: 'Profile updated', profileCompleteness: completeness });
    } else {
      // Mentor, Faculty, Admin Profile Update
      const cleanFullName = (fullName !== undefined && String(fullName).trim()) ? String(fullName).trim() : null;
      const cleanDept = (department !== undefined && String(department).trim()) ? String(department).trim() : null;
      const cleanDesig = (designation !== undefined && String(designation).trim()) ? String(designation).trim() : null;
      const cleanExp = (expertise !== undefined && String(expertise).trim()) ? String(expertise).trim() : null;

      const existingStaff = await getDoc(COLLECTIONS.STAFF_PROFILES, userId);
      const defaultDesig = req.user.role === 'mentor' ? 'Academic Mentor' : req.user.role === 'faculty' ? 'Faculty Member' : 'Administrator';

      const staffData = {
        user_id: userId,
        full_name: cleanFullName !== null ? cleanFullName : (existingStaff?.full_name || 'Staff Member'),
        department: cleanDept !== null ? cleanDept : (existingStaff?.department || 'Academic Department'),
        designation: cleanDesig !== null ? cleanDesig : (existingStaff?.designation || defaultDesig),
        expertise: cleanExp !== null ? cleanExp : (existingStaff?.expertise || '')
      };

      await setDoc(COLLECTIONS.STAFF_PROFILES, userId, staffData);
      return res.json({ message: 'Profile updated' });
    }
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: err.message || 'Failed to update profile.' });
  }
}

// POST /api/profile/suggest-skill
async function suggestSkill(req, res) {
  try {
    const { name, category, type = 'has' } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Skill name and category are required.' });
    }

    const trimmedName = name.trim();
    const trimmedCat = category.trim();

    const allSkills = await getAllDocs(COLLECTIONS.SKILLS);
    const existing = allSkills.find(s => s.name && s.name.toLowerCase() === trimmedName.toLowerCase());

    let skillId;
    if (existing) {
      skillId = existing.skill_id || existing.id;
    } else {
      skillId = `sk-${uuidv4().slice(0, 8)}`;
      await setDoc(COLLECTIONS.SKILLS, skillId, {
        skill_id: skillId,
        id: skillId,
        name: trimmedName,
        category: trimmedCat,
        approved: 0,
        suggested_by: req.user.userId,
        created_at: nowISO()
      });
    }

    // Immediately associate with student in user_skills
    const userSkills = await queryDocs(COLLECTIONS.USER_SKILLS, [
      ['user_id', '==', req.user.userId],
      ['skill_id', '==', skillId]
    ]);

    if (userSkills.length === 0) {
      const userSkillId = uuidv4();
      await setDoc(COLLECTIONS.USER_SKILLS, userSkillId, {
        id: userSkillId,
        user_id: req.user.userId,
        skill_id: skillId,
        type,
        level: 'beginner'
      });
    }

    return res.status(201).json({
      message: 'Skill saved to your profile and submitted for admin approval.',
      skillId,
      name: trimmedName,
      category: trimmedCat,
      approved: 0
    });
  } catch (err) {
    console.error('suggestSkill error:', err);
    return res.status(500).json({ error: 'Could not submit suggested skill.' });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  suggestSkill
};

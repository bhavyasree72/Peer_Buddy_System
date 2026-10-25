const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../database/db');

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

    const userRes = await query('SELECT user_id, sap_id, email, role, status FROM users WHERE user_id = ?', [targetUserId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userRes.rows[0];

    if (user.role === 'student') {
      const profRes = await query(`
        SELECT sp.*, s.name as school_name, p.name as program_name
        FROM student_profiles sp
        LEFT JOIN schools s ON sp.school_id = s.id
        LEFT JOIN programs p ON sp.program_id = p.id
        WHERE sp.user_id = ?
      `, [targetUserId]);
      const profile = profRes.rows[0] || {};

      // Skills (include approved flag so custom suggested skills show pending)
      const skillsRes = await query(`
        SELECT us.id, us.skill_id, us.type, us.level, sk.name, sk.category, sk.approved
        FROM user_skills us
        JOIN skills sk ON us.skill_id = sk.skill_id
        WHERE us.user_id = ?
      `, [targetUserId]);

      // Interests
      const interestsRes = await query(`
        SELECT ui.id, ui.interest_id, it.name, it.category
        FROM user_interests ui
        JOIN interests it ON ui.interest_id = it.interest_id
        WHERE ui.user_id = ?
      `, [targetUserId]);

      // Availability (respect show_availability if not owner)
      let availability = [];
      if (isOwner || profile.show_availability) {
        const availRes = await query(`
          SELECT * FROM availability WHERE user_id = ? ORDER BY day_of_week, start_time
        `, [targetUserId]);
        availability = availRes.rows;
      }

      // Reviews summary
      const reviewsRes = await query(`
        SELECT 
          COUNT(*) as review_count,
          AVG(punctuality) as avg_punctuality,
          AVG(helpfulness) as avg_helpfulness,
          AVG(communication) as avg_communication,
          AVG((punctuality + helpfulness + communication) / 3.0) as overall_rating
        FROM reviews
        WHERE reviewee_id = ?
      `, [targetUserId]);

      const reviewStats = reviewsRes.rows[0] || {};
      const reviewCount = parseInt(reviewStats.review_count || 0, 10);
      const rating = reviewCount >= 3 ? parseFloat(reviewStats.overall_rating || 0).toFixed(1) : null;

      // Recent reviews list
      const recentReviews = await query(`
        SELECT r.review_id, r.punctuality, r.helpfulness, r.communication, r.comment, r.created_at,
               sp.full_name as reviewer_name
        FROM reviews r
        JOIN student_profiles sp ON r.reviewer_id = sp.user_id
        WHERE r.reviewee_id = ?
        ORDER BY r.created_at DESC
        LIMIT 5
      `, [targetUserId]);

      const displayEmail = (isOwner || profile.show_email) ? user.email : null;

      return res.json({
        user: {
          userId: user.user_id,
          role: user.role,
          email: displayEmail,
          sapId: isOwner ? user.sap_id : null
        },
        profile,
        skills: skillsRes.rows,
        interests: interestsRes.rows,
        availability,
        reviewsCount: reviewCount,
        overallRating: rating,
        ratingDetails: reviewCount >= 3 ? {
          punctuality: parseFloat(reviewStats.avg_punctuality || 0).toFixed(1),
          helpfulness: parseFloat(reviewStats.avg_helpfulness || 0).toFixed(1),
          communication: parseFloat(reviewStats.avg_communication || 0).toFixed(1)
        } : null,
        recentReviews: recentReviews.rows,
        isOwner
      });
    } else {
      // Staff profile
      const staffRes = await query('SELECT * FROM staff_profiles WHERE user_id = ?', [targetUserId]);
      return res.json({
        user: {
          userId: user.user_id,
          role: user.role,
          email: user.email
        },
        profile: staffRes.rows[0] || {},
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
      skills, // array of { skillId, type: 'has' | 'wants_to_learn', level }
      interests, // array of interestId strings
      availability // array of { dayOfWeek, startTime, endTime }
    } = req.body;

    if (req.user.role === 'student') {
      if (bio && bio.length > 250) {
        return res.status(400).json({ error: 'Bio must be at most 250 characters.' });
      }

      // Convert empty strings to null for foreign keys and nullable fields
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

      const result = await withTransaction(async (txQuery) => {
        // Ensure student profile row exists
        const existingProf = await txQuery('SELECT user_id FROM student_profiles WHERE user_id = $1', [userId]);
        if (existingProf.rowCount === 0) {
          await txQuery(`
            INSERT INTO student_profiles (user_id, full_name, school_id, program_id, semester, year, bio, study_mode, open_to_requests, show_email, show_availability, photo_url, profile_completeness)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 50)
          `, [
            userId,
            cleanFullName || 'Student',
            cleanSchoolId,
            cleanProgramId,
            cleanSemester || 1,
            cleanYear || 1,
            cleanBio,
            cleanStudyMode || 'both',
            cleanOpenToReq !== null ? cleanOpenToReq : 1,
            cleanShowEmail !== null ? cleanShowEmail : 0,
            cleanShowAvail !== null ? cleanShowAvail : 1,
            cleanPhotoUrl
          ]);
        } else {
          await txQuery(`
            UPDATE student_profiles
            SET full_name = COALESCE($1::varchar, full_name),
                bio = COALESCE($2::text, bio),
                school_id = COALESCE($3::varchar, school_id),
                program_id = COALESCE($4::varchar, program_id),
                semester = COALESCE($5::int, semester),
                year = COALESCE($6::int, year),
                study_mode = COALESCE($7::varchar, study_mode),
                open_to_requests = COALESCE($8::int, open_to_requests),
                show_email = COALESCE($9::int, show_email),
                show_availability = COALESCE($10::int, show_availability),
                photo_url = COALESCE($11::varchar, photo_url)
            WHERE user_id = $12
          `, [
            cleanFullName,
            cleanBio,
            cleanSchoolId,
            cleanProgramId,
            cleanSemester,
            cleanYear,
            cleanStudyMode,
            cleanOpenToReq,
            cleanShowEmail,
            cleanShowAvail,
            cleanPhotoUrl,
            userId
          ]);
        }

        // Update skills atomically inside transaction
        if (Array.isArray(skills)) {
          await txQuery('DELETE FROM user_skills WHERE user_id = $1', [userId]);
          for (const s of skills) {
            const sId = s.skillId || s.skill_id;
            if (sId) {
              await txQuery(
                'INSERT INTO user_skills (id, user_id, skill_id, type, level) VALUES ($1, $2, $3, $4, $5)',
                [uuidv4(), userId, sId, s.type || 'has', s.level || 'intermediate']
              );
            }
          }
        }

        // Update interests atomically inside transaction
        if (Array.isArray(interests)) {
          await txQuery('DELETE FROM user_interests WHERE user_id = $1', [userId]);
          for (const intId of interests) {
            const actualId = typeof intId === 'object' ? (intId.interest_id || intId.interestId) : intId;
            if (actualId) {
              await txQuery(
                'INSERT INTO user_interests (id, user_id, interest_id) VALUES ($1, $2, $3)',
                [uuidv4(), userId, actualId]
              );
            }
          }
        }

        // Update availability atomically inside transaction
        if (Array.isArray(availability)) {
          await txQuery('DELETE FROM availability WHERE user_id = $1', [userId]);
          for (const slot of availability) {
            const day = slot.dayOfWeek || slot.day_of_week;
            const start = slot.startTime || slot.start_time;
            const end = slot.endTime || slot.end_time;
            if (day && start && end) {
              await txQuery(
                'INSERT INTO availability (availability_id, user_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4, $5)',
                [uuidv4(), userId, day, start, end]
              );
            }
          }
        }

        // Re-calculate completeness
        const profRes = await txQuery('SELECT * FROM student_profiles WHERE user_id = $1', [userId]);
        const skCount = (await txQuery('SELECT COUNT(*) as c FROM user_skills WHERE user_id = $1', [userId])).rows[0].c;
        const itCount = (await txQuery('SELECT COUNT(*) as c FROM user_interests WHERE user_id = $1', [userId])).rows[0].c;
        const avCount = (await txQuery('SELECT COUNT(*) as c FROM availability WHERE user_id = $1', [userId])).rows[0].c;

        const completeness = calculateCompleteness(profRes.rows[0], parseInt(skCount, 10), parseInt(itCount, 10), parseInt(avCount, 10));
        await txQuery('UPDATE student_profiles SET profile_completeness = $1 WHERE user_id = $2', [completeness, userId]);

        return { completeness };
      });

      return res.json({ message: 'Profile updated', profileCompleteness: result.completeness });
    } else {
      // Mentor, Faculty, Admin Profile Update
      const cleanFullName = (fullName !== undefined && String(fullName).trim()) ? String(fullName).trim() : null;
      const cleanDept = (department !== undefined && String(department).trim()) ? String(department).trim() : null;
      const cleanDesig = (designation !== undefined && String(designation).trim()) ? String(designation).trim() : null;
      const cleanExp = (expertise !== undefined && String(expertise).trim()) ? String(expertise).trim() : null;

      await withTransaction(async (txQuery) => {
        const staffRes = await txQuery('SELECT user_id FROM staff_profiles WHERE user_id = $1', [userId]);
        if (staffRes.rowCount === 0) {
          await txQuery(`
            INSERT INTO staff_profiles (user_id, full_name, department, designation, expertise)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            userId,
            cleanFullName || 'Staff Member',
            cleanDept || 'Academic Department',
            cleanDesig || (req.user.role === 'mentor' ? 'Academic Mentor' : req.user.role === 'faculty' ? 'Faculty Member' : 'Administrator'),
            cleanExp || ''
          ]);
        } else {
          await txQuery(`
            UPDATE staff_profiles
            SET full_name = COALESCE($1::varchar, full_name),
                department = COALESCE($2::varchar, department),
                designation = COALESCE($3::varchar, designation),
                expertise = COALESCE($4::text, expertise)
            WHERE user_id = $5
          `, [cleanFullName, cleanDept, cleanDesig, cleanExp, userId]);
        }
      });

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

    // Check if skill already exists in skills table
    let skillId;
    const existing = await query('SELECT skill_id, approved FROM skills WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing.rowCount > 0) {
      skillId = existing.rows[0].skill_id;
    } else {
      skillId = `sk-${uuidv4().slice(0, 8)}`;
      await query('INSERT INTO skills (skill_id, name, category, approved, suggested_by) VALUES (?, ?, ?, 0, ?)', [
        skillId,
        trimmedName,
        trimmedCat,
        req.user.userId
      ]);
    }

    // Immediately associate with student in user_skills as well so it stays on profile
    const existingUserSkill = await query('SELECT id FROM user_skills WHERE user_id = ? AND skill_id = ?', [req.user.userId, skillId]);
    if (existingUserSkill.rowCount === 0) {
      await query(
        'INSERT INTO user_skills (id, user_id, skill_id, type, level) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), req.user.userId, skillId, type, 'beginner']
      );
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

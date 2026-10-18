const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');

// Calculate profile completeness score (0 to 100)
function calculateCompleteness(profile, skillsCount, interestsCount, availabilityCount) {
  let score = 20; // base for registration
  if (profile.full_name) score += 10;
  if (profile.bio && profile.bio.trim().length > 10) score += 15;
  if (profile.school_id && profile.program_id) score += 15;
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

      // Skills
      const skillsRes = await query(`
        SELECT us.id, us.skill_id, us.type, us.level, sk.name, sk.category
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

      // Reviews summary (avg rating shown if >= 3 reviews as per doc)
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

      // Respect show_email
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
      skills, // array of { skillId, type: 'has' | 'wants_to_learn', level }
      interests, // array of interestId strings
      availability // array of { dayOfWeek, startTime, endTime }
    } = req.body;

    if (req.user.role === 'student') {
      // Validate bio length
      if (bio && bio.length > 250) {
        return res.status(400).json({ error: 'Bio must be at most 250 characters.' });
      }

      await query(`
        UPDATE student_profiles
        SET full_name = COALESCE(?, full_name),
            bio = COALESCE(?, bio),
            school_id = COALESCE(?, school_id),
            program_id = COALESCE(?, program_id),
            semester = COALESCE(?, semester),
            year = COALESCE(?, year),
            study_mode = COALESCE(?, study_mode),
            open_to_requests = COALESCE(?, open_to_requests),
            show_email = COALESCE(?, show_email),
            show_availability = COALESCE(?, show_availability),
            photo_url = COALESCE(?, photo_url)
        WHERE user_id = ?
      `, [
        fullName,
        bio,
        schoolId,
        programId,
        semester,
        year,
        studyMode,
        openToRequests !== undefined ? (openToRequests ? 1 : 0) : null,
        showEmail !== undefined ? (showEmail ? 1 : 0) : null,
        showAvailability !== undefined ? (showAvailability ? 1 : 0) : null,
        photoUrl,
        userId
      ]);

      // Update skills if provided
      if (Array.isArray(skills)) {
        await query('DELETE FROM user_skills WHERE user_id = ?', [userId]);
        for (const s of skills) {
          if (s.skillId) {
            await query(
              'INSERT INTO user_skills (id, user_id, skill_id, type, level) VALUES (?, ?, ?, ?, ?)',
              [uuidv4(), userId, s.skillId, s.type || 'has', s.level || 'intermediate']
            );
          }
        }
      }

      // Update interests if provided
      if (Array.isArray(interests)) {
        await query('DELETE FROM user_interests WHERE user_id = ?', [userId]);
        for (const intId of interests) {
          if (intId) {
            await query(
              'INSERT INTO user_interests (id, user_id, interest_id) VALUES (?, ?, ?)',
              [uuidv4(), userId, intId]
            );
          }
        }
      }

      // Update availability if provided
      if (Array.isArray(availability)) {
        await query('DELETE FROM availability WHERE user_id = ?', [userId]);
        for (const slot of availability) {
          if (slot.dayOfWeek && slot.startTime && slot.endTime) {
            await query(
              'INSERT INTO availability (availability_id, user_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?)',
              [uuidv4(), userId, slot.dayOfWeek, slot.startTime, slot.endTime]
            );
          }
        }
      }

      // Re-calculate completeness
      const profRes = await query('SELECT * FROM student_profiles WHERE user_id = ?', [userId]);
      const skCount = (await query('SELECT COUNT(*) as c FROM user_skills WHERE user_id = ?', [userId])).rows[0].c;
      const itCount = (await query('SELECT COUNT(*) as c FROM user_interests WHERE user_id = ?', [userId])).rows[0].c;
      const avCount = (await query('SELECT COUNT(*) as c FROM availability WHERE user_id = ?', [userId])).rows[0].c;

      const completeness = calculateCompleteness(profRes.rows[0], skCount, itCount, avCount);
      await query('UPDATE student_profiles SET profile_completeness = ? WHERE user_id = ?', [completeness, userId]);

      return res.json({ message: 'Profile updated', profileCompleteness: completeness });
    } else {
      // Staff profile update
      const { department, designation, expertise } = req.body;
      await query(`
        UPDATE staff_profiles
        SET full_name = COALESCE(?, full_name),
            department = COALESCE(?, department),
            designation = COALESCE(?, designation),
            expertise = COALESCE(?, expertise)
        WHERE user_id = ?
      `, [fullName, department, designation, expertise, userId]);

      return res.json({ message: 'Profile updated' });
    }
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
}

// POST /api/profile/suggest-skill
async function suggestSkill(req, res) {
  try {
    const { name, category } = req.body;
    if (!name || !category) {
      return res.status(400).json({ error: 'Skill name and category are required.' });
    }

    const skillId = `sk-${uuidv4().slice(0, 8)}`;
    await query('INSERT INTO skills (skill_id, name, category, approved, suggested_by) VALUES (?, ?, ?, 0, ?)', [
      skillId,
      name.trim(),
      category.trim(),
      req.user.userId
    ]);

    return res.status(201).json({
      message: 'Skill submitted for admin approval.',
      skillId
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

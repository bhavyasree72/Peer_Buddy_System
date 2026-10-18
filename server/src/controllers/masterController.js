const { query } = require('../database/db');

// GET /api/master/all
async function getMasterData(req, res) {
  try {
    const schools = (await query('SELECT * FROM schools ORDER BY name ASC')).rows;
    const programs = (await query('SELECT * FROM programs ORDER BY name ASC')).rows;
    const skills = (await query('SELECT * FROM skills WHERE approved = 1 ORDER BY category, name ASC')).rows;
    const interests = (await query('SELECT * FROM interests WHERE approved = 1 ORDER BY category, name ASC')).rows;
    const settings = (await query('SELECT * FROM settings')).rows;

    const settingsMap = {};
    settings.forEach(s => { settingsMap[s.key] = s.value; });

    const mentors = (await query(`
      SELECT u.user_id, COALESCE(sp.full_name, stp.full_name, u.email) as full_name,
             stp.department, stp.designation
      FROM users u
      LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN staff_profiles stp ON u.user_id = stp.user_id
      WHERE u.role = 'mentor' AND u.status = 'active'
      ORDER BY full_name ASC
    `)).rows;

    return res.json({
      schools,
      programs,
      skills,
      interests,
      mentors,
      settings: settingsMap,
      semesters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      studyModes: [
        { id: 'online', label: 'Online' },
        { id: 'on_campus', label: 'On Campus' },
        { id: 'both', label: 'Both' }
      ],
      daysOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    });
  } catch (err) {
    console.error('getMasterData error:', err);
    return res.status(500).json({ error: 'Failed to load master data.' });
  }
}

module.exports = {
  getMasterData
};

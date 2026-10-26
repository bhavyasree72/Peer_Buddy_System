const {
  COLLECTIONS,
  getAllDocs,
  queryDocs,
  getDoc
} = require('../database/firestoreDb');

// GET /api/master/all
async function getMasterData(req, res) {
  try {
    const rawSchools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const orderMap = { STME: 1, SOL: 2, SPTM: 3, SBM: 4, SOC: 5 };
    const schools = rawSchools.sort((a, b) => {
      const codeA = (a.code || '').toUpperCase();
      const codeB = (b.code || '').toUpperCase();
      const orderA = orderMap[codeA] || 6;
      const orderB = orderMap[codeB] || 6;
      return orderA - orderB;
    });

    const rawPrograms = await getAllDocs(COLLECTIONS.PROGRAMS);
    const programs = rawPrograms.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const rawSkills = await getAllDocs(COLLECTIONS.SKILLS);
    const skills = rawSkills
      .filter(s => s.approved === 1 || s.approved === true)
      .sort((a, b) => ((a.category || '') + (a.name || '')).localeCompare((b.category || '') + (b.name || '')));

    const rawInterests = await getAllDocs(COLLECTIONS.INTERESTS);
    const interests = rawInterests
      .filter(i => i.approved === 1 || i.approved === true)
      .sort((a, b) => ((a.category || '') + (a.name || '')).localeCompare((b.category || '') + (b.name || '')));

    const rawSettings = await getAllDocs(COLLECTIONS.SETTINGS);
    const settingsMap = {};
    rawSettings.forEach(s => {
      if (s.key) settingsMap[s.key] = s.value;
    });

    const mentorUsers = await queryDocs(COLLECTIONS.USERS, [
      ['role', '==', 'mentor'],
      ['status', '==', 'active']
    ]);

    const mentors = [];
    for (const u of mentorUsers) {
      const studentProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, u.user_id);
      const staffProf = await getDoc(COLLECTIONS.STAFF_PROFILES, u.user_id);
      const fullName = (studentProf && studentProf.full_name) ||
                       (staffProf && staffProf.full_name) ||
                       u.email || 'Mentor';
      mentors.push({
        user_id: u.user_id,
        full_name: fullName,
        department: staffProf ? staffProf.department : null,
        designation: staffProf ? staffProf.designation : null
      });
    }
    mentors.sort((a, b) => a.full_name.localeCompare(b.full_name));

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

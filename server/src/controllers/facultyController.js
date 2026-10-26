const {
  COLLECTIONS,
  getDoc,
  queryDocs,
  getAllDocs
} = require('../database/firestoreDb');

// Helper: convert date to IST string YYYY-MM-DD
function getISTDateStr(dateObj) {
  const istDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = istDate.getFullYear();
  const m = String(istDate.getMonth() + 1).padStart(2, '0');
  const d = String(istDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// GET /api/faculty/overview
async function getFacultyOverview(req, res) {
  try {
    const facultyUser = req.user;
    const staffProf = await getDoc(COLLECTIONS.STAFF_PROFILES, facultyUser.userId);
    const department = (staffProf && staffProf.department) || 'Computer Science & Engineering';

    // 1. Fetch collections in parallel
    const [
      allUsers,
      allStudentProfiles,
      allPrograms,
      allSessions,
      allConnections,
      allBuddyRequests
    ] = await Promise.all([
      getAllDocs(COLLECTIONS.USERS),
      getAllDocs(COLLECTIONS.STUDENT_PROFILES),
      getAllDocs(COLLECTIONS.PROGRAMS),
      getAllDocs(COLLECTIONS.STUDY_SESSIONS),
      getAllDocs(COLLECTIONS.CONNECTIONS),
      getAllDocs(COLLECTIONS.BUDDY_REQUESTS)
    ]);

    const progMap = new Map(allPrograms.map(p => [p.id, p]));
    const studentProfMap = new Map(allStudentProfiles.map(p => [p.user_id || p.id, p]));

    // 2. Student metrics
    const studentUsers = allUsers.filter(u => u.role === 'student');
    const totalStudents = studentUsers.length;
    const activeStudents = studentUsers.filter(u => u.status === 'active').length;
    const studentIdsSet = new Set(studentUsers.map(u => u.user_id || u.id));

    // 3. Buddy Connections & Requests metrics
    const activeConnections = allConnections.filter(c => c.status === 'active');
    const pendingRequests = allBuddyRequests.filter(r => r.status === 'pending');
    const acceptedRequests = allBuddyRequests.filter(r => r.status === 'accepted');

    // Students with at least one active connection
    const connectedStudentIds = new Set();
    activeConnections.forEach(c => {
      connectedStudentIds.add(c.user_a);
      connectedStudentIds.add(c.user_b);
    });
    let connectedStudentsCount = 0;
    connectedStudentIds.forEach(id => {
      if (studentIdsSet.has(id)) connectedStudentsCount++;
    });
    const engagementRate = totalStudents > 0 ? Math.round((connectedStudentsCount / totalStudents) * 100) : 0;

    // 4. Study Sessions metrics
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sessionsThisWeek = allSessions.filter(s => s.start_at && s.start_at >= oneWeekAgo).length;

    const scheduledSessions = allSessions.filter(s => ['confirmed', 'completed'].includes(s.status));
    const completedSessions = allSessions.filter(s => s.status === 'completed' || s.is_verified === 1);
    const verifiedSessions = allSessions.filter(s => 
      s.is_verified === 1 || (s.confirmed_by_organizer === 1 && s.confirmed_by_partner === 1)
    );

    const totalScheduled = scheduledSessions.length;
    const verifiedCount = verifiedSessions.length;
    const attendancePct = totalScheduled > 0 ? Math.round((verifiedCount / totalScheduled) * 100) : 0;

    // 5. Last 7 days session activity grouped by day in IST
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const chartData = [];
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recentSessionsForChart = allSessions.filter(s => s.start_at && s.start_at >= eightDaysAgo);

    const dateCountMap = {};
    for (const s of recentSessionsForChart) {
      const sDateStr = getISTDateStr(new Date(s.start_at));
      dateCountMap[sDateStr] = (dateCountMap[sDateStr] || 0) + 1;
    }

    for (let i = 6; i >= 0; i--) {
      const targetTime = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const targetDateStr = getISTDateStr(targetTime);
      const istDateObj = new Date(targetTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

      chartData.push({
        day: dayNames[istDateObj.getDay()],
        date: targetDateStr,
        sessions: dateCountMap[targetDateStr] || 0
      });
    }

    const totalSevenDaySessions = chartData.reduce((acc, d) => acc + d.sessions, 0);

    // 6. Student Overview: Semester Distribution & Program Distribution
    const semesterCountMap = {};
    const programCountMap = {};

    allStudentProfiles.forEach(sp => {
      if (!studentIdsSet.has(sp.user_id || sp.id)) return;

      const sem = sp.semester || 1;
      semesterCountMap[sem] = (semesterCountMap[sem] || 0) + 1;

      const progId = sp.program_id || 'unassigned';
      programCountMap[progId] = (programCountMap[progId] || 0) + 1;
    });

    const semesterDistribution = Object.entries(semesterCountMap)
      .map(([sem, count]) => ({
        semester: Number(sem),
        label: `Semester ${sem}`,
        count,
        percentage: totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0
      }))
      .sort((a, b) => a.semester - b.semester);

    const programDistribution = Object.entries(programCountMap)
      .map(([progId, count]) => {
        const prog = progMap.get(progId);
        return {
          programId: progId,
          name: prog ? prog.name : (progId === 'unassigned' ? 'General' : progId),
          code: prog ? prog.code : '',
          count,
          percentage: totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0
        };
      })
      .sort((a, b) => b.count - a.count);

    // 7. Recent Academic Activity (Top 7 events, strictly respecting chat privacy)
    const recentActivities = [];

    // Recent student registrations
    studentUsers.forEach(u => {
      const sp = studentProfMap.get(u.user_id || u.id);
      const prog = sp && sp.program_id ? progMap.get(sp.program_id) : null;
      recentActivities.push({
        id: `reg_${u.user_id || u.id}`,
        type: 'registration',
        title: 'New Student Registered',
        description: `${sp ? sp.full_name : u.email} enrolled in ${prog ? prog.name : 'NMIMS'}`,
        detail: sp ? `Semester ${sp.semester || 1}` : 'Student Portal',
        timestamp: u.created_at || (sp ? sp._updated_at : null) || now.toISOString()
      });
    });

    // Recent active connections formed
    activeConnections.forEach(c => {
      const spA = studentProfMap.get(c.user_a);
      const spB = studentProfMap.get(c.user_b);
      const nameA = spA ? spA.full_name : 'Student';
      const nameB = spB ? spB.full_name : 'Student';
      recentActivities.push({
        id: `conn_${c.connection_id || c.id}`,
        type: 'connection',
        title: 'Buddy Connection Formed',
        description: `${nameA} & ${nameB} established an active peer study partnership`,
        detail: 'Active Connection',
        timestamp: c.created_at || c._updated_at || now.toISOString()
      });
    });

    // Recent study sessions
    allSessions.forEach(s => {
      const spOrg = studentProfMap.get(s.organizer_id);
      const isCompleted = s.status === 'completed' || s.is_verified === 1;
      recentActivities.push({
        id: `sess_${s.session_id || s.id}`,
        type: isCompleted ? 'session_completed' : 'session_scheduled',
        title: isCompleted ? 'Study Session Completed' : 'Study Session Scheduled',
        description: `"${s.title}" (${s.subject || 'Coursework'}) with ${spOrg ? spOrg.full_name : 'Peer'}`,
        detail: `${s.mode === 'online' ? 'Online' : 'In-Person'} • ${s.status}`,
        timestamp: s.created_at || s.start_at || now.toISOString()
      });
    });

    recentActivities.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    const recentActivity = recentActivities.slice(0, 8);

    return res.json({
      department,
      metrics: {
        activeStudents,
        totalStudents,
        activeConnections: activeConnections.length,
        pendingRequests: pendingRequests.length,
        totalBuddyRequests: allBuddyRequests.length,
        sessionsThisWeek,
        totalScheduledSessions: totalScheduled,
        completedSessions: completedSessions.length,
        totalSessions: allSessions.length,
        verifiedSessions: verifiedCount,
        attendancePercentage: totalScheduled > 0 ? attendancePct : null,
        engagementRate,
        connectedStudentsCount
      },
      chartData,
      totalSevenDaySessions,
      academicDistribution: {
        semesters: semesterDistribution,
        programs: programDistribution
      },
      recentActivity
    });
  } catch (err) {
    console.error('getFacultyOverview error:', err);
    return res.status(500).json({ error: 'Failed to load faculty overview.' });
  }
}

// GET /api/faculty/sessions
async function getFacultySessions(req, res) {
  try {
    const { semester, startDate, endDate } = req.query;

    const allSessions = await getAllDocs(COLLECTIONS.STUDY_SESSIONS);
    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p.name]));

    let filtered = allSessions;

    if (semester) {
      const semNum = parseInt(semester, 10);
      filtered = filtered.filter(s => Number(s.semester) === semNum);
    }
    if (startDate) {
      filtered = filtered.filter(s => s.start_at && s.start_at >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(s => s.start_at && s.start_at <= endDate);
    }

    const sessions = [];
    for (const s of filtered) {
      const orgProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, s.organizer_id);
      const partProf = await getDoc(COLLECTIONS.STUDENT_PROFILES, s.partner_id);

      const isVerified = (s.is_verified === 1 || (s.confirmed_by_organizer === 1 && s.confirmed_by_partner === 1)) ? 1 : 0;
      const attendeesCount = (Number(s.confirmed_by_organizer) || 0) + (Number(s.confirmed_by_partner) || 0);

      sessions.push({
        session_id: s.session_id || s.id,
        title: s.title,
        subject: s.subject,
        start_at: s.start_at,
        end_at: s.end_at,
        mode: s.mode,
        location_or_link: s.location_or_link,
        status: s.status,
        semester: s.semester,
        confirmed_by_organizer: s.confirmed_by_organizer || 0,
        confirmed_by_partner: s.confirmed_by_partner || 0,
        is_verified: s.is_verified || 0,
        organizer_name: orgProf ? orgProf.full_name : 'Organizer',
        partner_name: partProf ? partProf.full_name : 'Partner',
        program_name: orgProf && orgProf.program_id ? (progMap.get(orgProf.program_id) || null) : null,
        attendees_count: attendeesCount,
        verified_session: isVerified
      });
    }

    sessions.sort((a, b) => new Date(b.start_at || 0) - new Date(a.start_at || 0));
    return res.json({ sessions });
  } catch (err) {
    console.error('getFacultySessions error:', err);
    return res.status(500).json({ error: 'Failed to load faculty sessions.' });
  }
}

// GET /api/faculty/students
async function getFacultyStudents(req, res) {
  try {
    const { programId, semester, q } = req.query;

    const studentUsers = await queryDocs(COLLECTIONS.USERS, [
      ['role', '==', 'student'],
      ['status', '==', 'active']
    ]);

    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p]));
    const schools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const schoolMap = new Map(schools.map(s => [s.id, s]));
    const allSessions = await getAllDocs(COLLECTIONS.STUDY_SESSIONS);

    const students = [];

    for (const u of studentUsers) {
      const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, u.user_id);
      if (!sp) continue;

      const prog = sp.program_id ? progMap.get(sp.program_id) : null;
      const sch = sp.school_id ? schoolMap.get(sp.school_id) : null;

      // Filter by semester
      if (semester && Number(sp.semester) !== parseInt(semester, 10)) {
        continue;
      }

      // Filter by programId (matches ID, Code e.g. 'CA' / 'CSGS', or Name)
      if (programId) {
        const pIdLower = programId.toLowerCase();
        const matchesProgId = sp.program_id === programId;
        const matchesCode = prog && prog.code && prog.code.toLowerCase() === pIdLower;
        const matchesName = prog && prog.name && prog.name.toLowerCase().includes(pIdLower);
        if (!matchesProgId && !matchesCode && !matchesName) {
          continue;
        }
      }

      // Filter by search query q
      if (q) {
        const qLower = q.toLowerCase();
        const nameMatch = sp.full_name && sp.full_name.toLowerCase().includes(qLower);
        const emailMatch = u.email && u.email.toLowerCase().includes(qLower);
        const progMatch = prog && prog.name && prog.name.toLowerCase().includes(qLower);
        if (!nameMatch && !emailMatch && !progMatch) {
          continue;
        }
      }

      const sessionsCount = allSessions.filter(s => s.organizer_id === u.user_id || s.partner_id === u.user_id).length;

      students.push({
        user_id: u.user_id,
        email: u.email,
        full_name: sp.full_name,
        semester: sp.semester,
        year: sp.year,
        program_id: sp.program_id,
        school_id: sp.school_id,
        bio: sp.bio,
        program_name: prog ? prog.name : null,
        program_code: prog ? prog.code : null,
        school_name: sch ? sch.name : null,
        school_code: sch ? sch.code : null,
        sessions_count: sessionsCount
      });
    }

    students.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    return res.json({ students });
  } catch (err) {
    console.error('getFacultyStudents error:', err);
    return res.status(500).json({ error: 'Failed to load students.' });
  }
}

// GET /api/faculty/reports
async function getFacultyReports(req, res) {
  try {
    const allSessions = await getAllDocs(COLLECTIONS.STUDY_SESSIONS);
    const totalSessions = allSessions.length;
    const completedSessions = allSessions.filter(s => s.status === 'completed').length;

    const allReviews = await getAllDocs(COLLECTIONS.REVIEWS);
    let avgRating = '5.0';
    if (allReviews.length > 0) {
      const sum = allReviews.reduce((acc, r) => {
        return acc + (((Number(r.punctuality) || 0) + (Number(r.helpfulness) || 0) + (Number(r.communication) || 0)) / 3.0);
      }, 0);
      avgRating = (sum / allReviews.length).toFixed(1);
    }

    // Subject breakdown
    const subjectCountMap = {};
    allSessions.forEach(s => {
      if (s.subject) {
        const sub = s.subject.trim();
        subjectCountMap[sub] = (subjectCountMap[sub] || 0) + 1;
      }
    });

    const subjectBreakdown = Object.entries(subjectCountMap)
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return res.json({
      summary: {
        totalSessions,
        completedSessions,
        avgRating
      },
      subjectBreakdown
    });
  } catch (err) {
    console.error('getFacultyReports error:', err);
    return res.status(500).json({ error: 'Failed to load faculty reports.' });
  }
}

module.exports = {
  getFacultyOverview,
  getFacultySessions,
  getFacultyStudents,
  getFacultyReports
};

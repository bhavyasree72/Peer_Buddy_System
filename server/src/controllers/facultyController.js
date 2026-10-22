const { query } = require('../database/db');

// GET /api/faculty/overview
// Overview: department summary tiles + weekly sessions chart from real data
async function getFacultyOverview(req, res) {
  try {
    const facultyUser = req.user;
    const staffRes = await query('SELECT department FROM staff_profiles WHERE user_id = ?', [facultyUser.userId]);
    const department = (staffRes.rows[0] && staffRes.rows[0].department) || 'Computer Science & Engineering';

    // 1. Active students count
    const activeStudentsRes = await query(`
      SELECT COUNT(*) as c FROM users WHERE role = 'student' AND status = 'active'
    `);
    const activeStudents = activeStudentsRes.rows[0].c;

    // Helper: convert date to IST string YYYY-MM-DD
    function getISTDateStr(dateObj) {
      const istDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const y = istDate.getFullYear();
      const m = String(istDate.getMonth() + 1).padStart(2, '0');
      const d = String(istDate.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 2. Real Sessions this week
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const sessionsWeekRes = await query(`
      SELECT COUNT(*) as c FROM study_sessions WHERE start_at >= ?
    `, [oneWeekAgo]);
    const sessionsThisWeek = sessionsWeekRes.rows[0].c;

    // 3. Real Attendance % = (verified sessions / total scheduled sessions) * 100 (Issue 13)
    // Never default to 100% when there are 0 sessions.
    const totalSessionsRes = await query(`SELECT COUNT(*) as c FROM study_sessions WHERE status IN ('confirmed', 'completed')`);
    const verifiedSessionsRes = await query(`
      SELECT COUNT(*) as c FROM study_sessions 
      WHERE (is_verified = 1 OR (confirmed_by_organizer = 1 AND confirmed_by_partner = 1))
    `);

    const totalScheduled = totalSessionsRes.rows[0].c || 0;
    const verifiedCount = verifiedSessionsRes.rows[0].c || 0;
    const attendancePct = totalScheduled > 0 ? Math.round((verifiedCount / totalScheduled) * 100) : 0;

    // 4. Last 7 days session activity grouped by day in IST (Asia/Kolkata) (Issue 12)
    // Include days with zero as 0
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const chartData = [];

    // Fetch all sessions in the last 7 days window
    const recentSessionsRes = await query(`
      SELECT session_id, start_at FROM study_sessions 
      WHERE start_at >= ?
    `, [new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()]);

    const dateCountMap = {};
    for (const s of recentSessionsRes.rows) {
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

    return res.json({
      department,
      metrics: {
        activeStudents,
        sessionsThisWeek,
        totalScheduledSessions: totalScheduled,
        verifiedSessions: verifiedCount,
        attendancePercentage: totalScheduled > 0 ? attendancePct : null
      },
      chartData,
      totalSevenDaySessions
    });
  } catch (err) {
    console.error('getFacultyOverview error:', err);
    return res.status(500).json({ error: 'Failed to load faculty overview.' });
  }
}

// GET /api/faculty/sessions
// Full sessions table with department, semester and date filters, and attendance counts
// Faculty must strictly not be able to read private chats.
async function getFacultySessions(req, res) {
  try {
    const { department, semester, startDate, endDate } = req.query;

    let sql = `
      SELECT s.session_id, s.title, s.subject, s.start_at, s.end_at, s.mode, s.location_or_link, s.status, s.semester,
             s.confirmed_by_organizer, s.confirmed_by_partner, s.is_verified,
             org.full_name as organizer_name,
             part.full_name as partner_name,
             p.name as program_name,
             ((COALESCE(s.confirmed_by_organizer, 0) + COALESCE(s.confirmed_by_partner, 0))) as attendees_count,
             (CASE WHEN s.is_verified = 1 OR (s.confirmed_by_organizer = 1 AND s.confirmed_by_partner = 1) THEN 1 ELSE 0 END) as verified_session
      FROM study_sessions s
      JOIN student_profiles org ON s.organizer_id = org.user_id
      JOIN student_profiles part ON s.partner_id = part.user_id
      LEFT JOIN programs p ON org.program_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (semester) {
      sql += ' AND s.semester = ?';
      params.push(parseInt(semester, 10));
    }
    if (startDate) {
      sql += ' AND s.start_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND s.start_at <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY s.start_at DESC';

    const sessionsRes = await query(sql, params);
    return res.json({ sessions: sessionsRes.rows });
  } catch (err) {
    console.error('getFacultySessions error:', err);
    return res.status(500).json({ error: 'Failed to load faculty sessions.' });
  }
}

// GET /api/faculty/students
// Students list for faculty
async function getFacultyStudents(req, res) {
  try {
    const { semester, q } = req.query;
    let sql = `
      SELECT u.user_id, u.email, sp.full_name, sp.semester, sp.year, p.name as program_name, s.name as school_name,
             (SELECT COUNT(*) FROM study_sessions WHERE organizer_id = u.user_id OR partner_id = u.user_id) as sessions_count
      FROM users u
      JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      LEFT JOIN schools s ON sp.school_id = s.id
      WHERE u.role = 'student' AND u.status = 'active'
    `;
    const params = [];

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
    console.error('getFacultyStudents error:', err);
    return res.status(500).json({ error: 'Failed to load students.' });
  }
}

// GET /api/faculty/reports
// Department reports overview (academic stats, attendance summary, feedback ratings)
async function getFacultyReports(req, res) {
  try {
    const totalSessions = (await query(`SELECT COUNT(*) as c FROM study_sessions`)).rows[0].c || 0;
    const completedSessions = (await query(`SELECT COUNT(*) as c FROM study_sessions WHERE status = 'completed'`)).rows[0].c || 0;
    const avgRatingRes = (await query(`SELECT AVG((punctuality + helpfulness + communication) / 3.0) as avg FROM reviews`)).rows[0];
    const avgRating = avgRatingRes.avg ? parseFloat(avgRatingRes.avg).toFixed(1) : '5.0';

    const subjectBreakdown = (await query(`
      SELECT subject, COUNT(*) as count 
      FROM study_sessions 
      GROUP BY subject 
      ORDER BY count DESC 
      LIMIT 10
    `)).rows;

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

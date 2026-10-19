const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { query } = require('../database/db');

// GET /api/admin/dashboard
async function getAdminDashboard(req, res) {
  try {
    const totalUsers = (await query('SELECT COUNT(*) as c FROM users WHERE status != "deleted"')).rows[0].c;
    
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const activeThisWeek = (await query('SELECT COUNT(*) as c FROM users WHERE last_login >= ?', [oneWeekAgo])).rows[0].c;

    const openReports = (await query('SELECT COUNT(*) as c FROM reports WHERE status IN ("Submitted", "Under review")')).rows[0].c;

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const sessionsThisMonth = (await query('SELECT COUNT(*) as c FROM study_sessions WHERE start_at >= ?', [startOfMonth])).rows[0].c;

    // Requests statistics
    const totalRequests = (await query('SELECT COUNT(*) as c FROM buddy_requests')).rows[0].c;
    const acceptedRequests = (await query('SELECT COUNT(*) as c FROM buddy_requests WHERE status = "accepted"')).rows[0].c;

    // Real charts data: Registrations & Sessions over last 7 days
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const regCount = (await query(`SELECT COUNT(*) as c FROM users WHERE created_at LIKE ?`, [`${dateStr}%`])).rows[0].c || 0;
      const sessCount = (await query(`SELECT COUNT(*) as c FROM study_sessions WHERE start_at LIKE ?`, [`${dateStr}%`])).rows[0].c || 0;
      const reqCount = (await query(`SELECT COUNT(*) as c FROM buddy_requests WHERE created_at LIKE ?`, [`${dateStr}%`])).rows[0].c || 0;
      trendData.push({
        day: days[d.getDay()],
        date: dateStr,
        registrations: regCount,
        sessions: sessCount,
        requests: reqCount
      });
    }

    // Role breakdown
    const roleStats = (await query(`SELECT role, COUNT(*) as c FROM users GROUP BY role`)).rows;

    // Settings
    const settingsRows = (await query('SELECT * FROM settings')).rows;
    const settingsMap = {};
    settingsRows.forEach(s => { settingsMap[s.key] = s.value; });

    return res.json({
      metrics: {
        totalUsers,
        activeThisWeek,
        openReports,
        sessionsThisMonth,
        totalRequests,
        acceptedRequests
      },
      trendData,
      roleStats,
      settings: settingsMap
    });
  } catch (err) {
    console.error('getAdminDashboard error:', err);
    return res.status(500).json({ error: 'Failed to load administrator dashboard.' });
  }
}

// Master Data CRUD endpoints
async function getMasterDataAll(req, res) {
  try {
    const schools = (await query('SELECT * FROM schools ORDER BY name ASC')).rows;
    const programs = (await query('SELECT * FROM programs ORDER BY name ASC')).rows;
    const skills = (await query('SELECT * FROM skills ORDER BY category, name ASC')).rows;
    const interests = (await query('SELECT * FROM interests ORDER BY category, name ASC')).rows;
    return res.json({ schools, programs, skills, interests });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load master data.' });
  }
}

async function addMasterItem(req, res) {
  try {
    const adminId = req.user.userId;
    const { type, data } = req.body; // type: 'school', 'program', 'skill', 'interest'
    if (type === 'school') {
      const id = data.id || `sch-${data.code.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      await query('INSERT INTO schools (id, name, code, semesters) VALUES (?, ?, ?, ?)', [id, data.name, data.code, data.semesters || 8]);
    } else if (type === 'program') {
      const id = data.id || `prog-${uuidv4().slice(0, 8)}`;
      await query('INSERT INTO programs (id, school_id, name, code) VALUES (?, ?, ?, ?)', [id, data.school_id, data.name, data.code]);
    } else if (type === 'skill') {
      const id = `sk-${uuidv4().slice(0, 8)}`;
      await query('INSERT INTO skills (skill_id, name, category, approved) VALUES (?, ?, ?, 1)', [id, data.name, data.category || 'Technology']);
    } else if (type === 'interest') {
      const id = `int-${uuidv4().slice(0, 8)}`;
      await query('INSERT INTO interests (interest_id, name, category, approved) VALUES (?, ?, ?, 1)', [id, data.name, data.category || 'Academic']);
    }
    await query(`INSERT INTO audit_log (log_id, actor_id, action, details) VALUES (?, ?, 'MASTER_DATA_ADD', ?)`, [uuidv4(), adminId, `Added master ${type}: ${data.name}`]);
    return res.status(201).json({ message: `${type} added successfully.` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Failed to add item.' });
  }
}

async function deleteMasterItem(req, res) {
  try {
    const adminId = req.user.userId;
    const { type, id } = req.body;
    if (type === 'school') {
      await query('DELETE FROM schools WHERE id = ?', [id]);
    } else if (type === 'program') {
      await query('DELETE FROM programs WHERE id = ?', [id]);
    } else if (type === 'skill') {
      await query('DELETE FROM skills WHERE skill_id = ?', [id]);
    } else if (type === 'interest') {
      await query('DELETE FROM interests WHERE interest_id = ?', [id]);
    }
    await query(`INSERT INTO audit_log (log_id, actor_id, action, details) VALUES (?, ?, 'MASTER_DATA_DELETE', ?)`, [uuidv4(), adminId, `Deleted master ${type}: ${id}`]);
    return res.json({ message: `${type} deleted successfully.` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete item.' });
  }
}

// Announcements endpoints
async function getAnnouncements(req, res) {
  try {
    const banner = (await query('SELECT value FROM settings WHERE key = "announcement_banner"')).rows[0];
    return res.json({ announcement: banner ? banner.value : '' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load announcements.' });
  }
}

async function saveAnnouncement(req, res) {
  try {
    const adminId = req.user.userId;
    const { announcement } = req.body;
    await query('UPDATE settings SET value = ? WHERE key = "announcement_banner"', [announcement || '']);
    await query(`INSERT INTO audit_log (log_id, actor_id, action, details) VALUES (?, ?, 'ANNOUNCEMENT_UPDATED', ?)`, [uuidv4(), adminId, announcement ? `Updated banner: ${announcement}` : 'Cleared banner']);
    return res.json({ message: 'Announcement banner updated successfully.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update announcement.' });
  }
}

// GET /api/admin/users
async function getUsers(req, res) {
  try {
    const { q, role, status } = req.query;

    let sql = `
      SELECT u.user_id, u.sap_id, u.email, u.role, u.status, u.email_verified, u.created_at, u.last_login,
             COALESCE(sp.full_name, stp.full_name, 'Unknown') as full_name,
             p.name as program_name, s.name as school_name
      FROM users u
      LEFT JOIN student_profiles sp ON u.user_id = sp.user_id
      LEFT JOIN staff_profiles stp ON u.user_id = stp.user_id
      LEFT JOIN programs p ON sp.program_id = p.id
      LEFT JOIN schools s ON sp.school_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      sql += ' AND u.role = ?';
      params.push(role);
    }
    if (status) {
      sql += ' AND u.status = ?';
      params.push(status);
    }
    if (q) {
      sql += ' AND (LOWER(u.email) LIKE ? OR LOWER(u.sap_id) LIKE ? OR LOWER(COALESCE(sp.full_name, stp.full_name, "")) LIKE ?)';
      params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
    }

    sql += ' ORDER BY u.created_at DESC';

    const usersRes = await query(sql, params);
    return res.json({ users: usersRes.rows });
  } catch (err) {
    console.error('getUsers error:', err);
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

// PUT /api/admin/users/:userId/status
async function updateUserStatus(req, res) {
  try {
    const adminId = req.user.userId;
    const { userId } = req.params;
    const { status, role } = req.body; // status: 'active', 'suspended', 'deleted'

    if (status) {
      if (status === 'deleted') {
        // Anonymization rule from doc 6.3:
        // "Deleting a user anonymizes their name in old chats, reviews and reports instead of removing the rows,
        // so other students' history stays intact."
        await query(`
          UPDATE student_profiles 
          SET full_name = 'Former Student', bio = NULL, photo_url = NULL 
          WHERE user_id = ?
        `, [userId]);

        await query(`
          UPDATE staff_profiles 
          SET full_name = 'Former Staff', expertise = NULL, photo_url = NULL 
          WHERE user_id = ?
        `, [userId]);

        await query('UPDATE users SET status = "deleted", sap_id = NULL WHERE user_id = ?', [userId]);

        await query(`
          INSERT INTO audit_log (log_id, actor_id, action, target, details)
          VALUES (?, ?, 'USER_DELETED_ANONYMIZED', ?, 'User marked deleted and personal data anonymized')
        `, [uuidv4(), adminId, userId]);

        return res.json({ message: 'User deleted and profile anonymized.' });
      } else {
        await query('UPDATE users SET status = ? WHERE user_id = ?', [status, userId]);

        await query(`
          INSERT INTO audit_log (log_id, actor_id, action, target, details)
          VALUES (?, ?, 'USER_STATUS_CHANGE', ?, ?)
        `, [uuidv4(), adminId, userId, `Status changed to ${status}`]);

        return res.json({ message: `User status changed to ${status}.` });
      }
    }

    if (role) {
      await query('UPDATE users SET role = ? WHERE user_id = ?', [role, userId]);

      await query(`
        INSERT INTO audit_log (log_id, actor_id, action, target, details)
        VALUES (?, ?, 'USER_ROLE_CHANGE', ?, ?)
      `, [uuidv4(), adminId, userId, `Role updated to ${role}`]);

      return res.json({ message: `User role changed to ${role}.` });
    }

    return res.status(400).json({ error: 'No status or role specified.' });
  } catch (err) {
    console.error('updateUserStatus error:', err);
    return res.status(500).json({ error: 'Failed to update user.' });
  }
}

// POST /api/admin/users/bulk-import
async function bulkImportUsers(req, res) {
  try {
    const adminId = req.user.userId;
    const { students } = req.body; // array of { fullName, sapId, email, schoolCode, programCode, semester }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'A list of students is required for bulk import.' });
    }

    let imported = 0;
    const defaultPasswordHash = await bcrypt.hash('Student@123', 10);

    for (const s of students) {
      if (!s.email || !s.sapId) continue;
      const email = s.email.trim().toLowerCase();
      const existing = await query('SELECT user_id FROM users WHERE email = ? OR sap_id = ?', [email, s.sapId]);
      if (existing.rowCount === 0) {
        const userId = uuidv4();
        await query(`
          INSERT INTO users (user_id, sap_id, email, password_hash, role, status, email_verified)
          VALUES (?, ?, ?, ?, 'student', 'active', 1)
        `, [userId, s.sapId, email, defaultPasswordHash]);

        await query(`
          INSERT INTO student_profiles (user_id, full_name, semester, profile_completeness)
          VALUES (?, ?, ?, 30)
        `, [userId, s.fullName || 'Student', s.semester || 1]);

        imported++;
      }
    }

    await query(`
      INSERT INTO audit_log (log_id, actor_id, action, details)
      VALUES (?, ?, 'BULK_USER_IMPORT', ?)
    `, [uuidv4(), adminId, `Bulk imported ${imported} students`]);

    return res.json({ message: `Successfully imported ${imported} students.`, count: imported });
  } catch (err) {
    console.error('bulkImportUsers error:', err);
    return res.status(500).json({ error: 'Bulk import failed.' });
  }
}

// GET /api/admin/reports
async function getReports(req, res) {
  try {
    const reportsRes = await query(`
      SELECT r.*,
             rep.email as reporter_email,
             COALESCE(rep_sp.full_name, 'Reporter') as reporter_name,
             trg.email as target_email,
             COALESCE(trg_sp.full_name, 'Reported Student') as target_name
      FROM reports r
      JOIN users rep ON r.reporter_id = rep.user_id
      LEFT JOIN student_profiles rep_sp ON r.reporter_id = rep_sp.user_id
      JOIN users trg ON r.reported_user_id = trg.user_id
      LEFT JOIN student_profiles trg_sp ON r.reported_user_id = trg_sp.user_id
      ORDER BY r.created_at DESC
    `);

    return res.json({ reports: reportsRes.rows });
  } catch (err) {
    console.error('getReports error:', err);
    return res.status(500).json({ error: 'Failed to fetch moderation reports.' });
  }
}

// POST /api/admin/reports/:reportId/action
// Admin actions from doc: warn, suspend for a number of days, ban, or dismiss
async function handleReportAction(req, res) {
  try {
    const adminId = req.user.userId;
    const { reportId } = req.params;
    const { action, suspendDays, notes } = req.body; // 'warn', 'suspend', 'ban', 'dismiss'

    const reportRes = await query('SELECT * FROM reports WHERE report_id = ?', [reportId]);
    if (reportRes.rowCount === 0) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const report = reportRes.rows[0];

    if (action === 'suspend') {
      await query('UPDATE users SET status = "suspended" WHERE user_id = ?', [report.reported_user_id]);
    } else if (action === 'ban') {
      await query('UPDATE users SET status = "suspended" WHERE user_id = ?', [report.reported_user_id]);
    }

    const finalStatus = action === 'dismiss' ? 'Closed' : 'Action taken';

    await query(`
      UPDATE reports 
      SET status = ?, handled_by = ?, action_taken = ?, updated_at = datetime('now')
      WHERE report_id = ?
    `, [finalStatus, adminId, `${action.toUpperCase()}: ${notes || 'No extra notes'}`, reportId]);

    // Audit log
    await query(`
      INSERT INTO audit_log (log_id, actor_id, action, target, details)
      VALUES (?, ?, ?, ?, ?)
    `, [uuidv4(), adminId, `REPORT_ACTION_${action.toUpperCase()}`, report.reported_user_id, notes || '']);

    return res.json({ message: `Action ${action} executed and logged.` });
  } catch (err) {
    console.error('handleReportAction error:', err);
    return res.status(500).json({ error: 'Failed to execute moderation action.' });
  }
}

// GET /api/admin/audit-log
async function getAuditLog(req, res) {
  try {
    const logRes = await query(`
      SELECT al.*, u.email as actor_email
      FROM audit_log al
      LEFT JOIN users u ON al.actor_id = u.user_id
      ORDER BY al.created_at DESC
      LIMIT 100
    `);

    return res.json({ auditLog: logRes.rows });
  } catch (err) {
    console.error('getAuditLog error:', err);
    return res.status(500).json({ error: 'Failed to load audit logs.' });
  }
}

// POST /api/admin/settings
async function updateSettings(req, res) {
  try {
    const adminId = req.user.userId;
    const { settings } = req.body; // object with key-values

    if (typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload.' });
    }

    for (const [key, val] of Object.entries(settings)) {
      const existing = await query('SELECT key FROM settings WHERE key = ?', [key]);
      if (existing.rowCount > 0) {
        await query('UPDATE settings SET value = ? WHERE key = ?', [String(val), key]);
      } else {
        await query('INSERT INTO settings (key, value) VALUES (?, ?)', [key, String(val)]);
      }
    }

    await query(`
      INSERT INTO audit_log (log_id, actor_id, action, details)
      VALUES (?, ?, 'SETTINGS_UPDATED', 'Updated match weights / system settings')
    `, [uuidv4(), adminId]);

    return res.json({ message: 'Settings saved successfully.' });
  } catch (err) {
    console.error('updateSettings error:', err);
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
}

// POST /api/admin/master-data/skills
async function createMasterSkill(req, res) {
  try {
    const { name, category } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Name and category required.' });

    const skillId = `sk-${uuidv4().slice(0, 8)}`;
    await query('INSERT INTO skills (skill_id, name, category, approved) VALUES (?, ?, ?, 1)', [
      skillId,
      name.trim(),
      category.trim()
    ]);

    return res.status(201).json({ message: 'Skill created', skillId });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create skill.' });
  }
}

// POST /api/admin/users/create
async function createUser(req, res) {
  try {
    const adminId = req.user.userId;
    const { fullName, email, password, role, sapId, department, designation } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: 'Full name, email, password, and role are required.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const allowedRoles = ['student', 'mentor', 'faculty', 'admin'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified.' });
    }

    const existing = await query('SELECT user_id FROM users WHERE email = ?', [trimmedEmail]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    await query(
      `INSERT INTO users (user_id, sap_id, email, password_hash, role, status, email_verified)
       VALUES (?, ?, ?, ?, ?, 'active', 1)`,
      [userId, sapId ? sapId.trim() : null, trimmedEmail, passwordHash, role]
    );

    if (role === 'student') {
      await query(
        `INSERT INTO student_profiles (user_id, full_name, profile_completeness) VALUES (?, ?, 50)`,
        [userId, fullName.trim()]
      );
    } else {
      await query(
        `INSERT INTO staff_profiles (user_id, full_name, department, designation, expertise)
         VALUES (?, ?, ?, ?, ?)`,
        [
          userId,
          fullName.trim(),
          department ? department.trim() : 'Academic Department',
          designation ? designation.trim() : (role === 'mentor' ? 'Academic Mentor' : role === 'faculty' ? 'Faculty Member' : 'Administrator'),
          `${role.charAt(0).toUpperCase() + role.slice(1)} at NMIMS`
        ]
      );
    }

    await query(`INSERT INTO audit_log (log_id, actor_id, action, target, details) VALUES (?, ?, 'ADMIN_USER_PROVISIONED', ?, ?)`, [
      uuidv4(),
      adminId,
      trimmedEmail,
      `Admin provisioned ${role} account for ${fullName.trim()} (${trimmedEmail})`
    ]);

    return res.status(201).json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully.`, userId });
  } catch (err) {
    console.error('createUser error:', err);
    return res.status(500).json({ error: 'Failed to create user.' });
  }
}

module.exports = {
  getAdminDashboard,
  getUsers,
  createUser,
  updateUserStatus,
  bulkImportUsers,
  getReports,
  handleReportAction,
  getAuditLog,
  updateSettings,
  createMasterSkill,
  getMasterDataAll,
  addMasterItem,
  deleteMasterItem,
  getAnnouncements,
  saveAnnouncement
};

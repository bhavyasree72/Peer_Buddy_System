const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const {
  COLLECTIONS,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  queryDocs,
  getAllDocs,
  countDocs,
  nowISO
} = require('../database/firestoreDb');

// GET /api/admin/dashboard
async function getAdminDashboard(req, res) {
  try {
    const allUsers = await getAllDocs(COLLECTIONS.USERS);
    const nonDeletedUsers = allUsers.filter(u => u.status !== 'deleted');
    const totalUsers = nonDeletedUsers.length;

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const activeThisWeek = nonDeletedUsers.filter(u => u.last_login && u.last_login >= oneWeekAgo).length;

    const allReports = await getAllDocs(COLLECTIONS.REPORTS);
    const openReports = allReports.filter(r => ['Submitted', 'Under review'].includes(r.status)).length;

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const allSessions = await getAllDocs(COLLECTIONS.STUDY_SESSIONS);
    const sessionsThisMonth = allSessions.filter(s => s.start_at && s.start_at >= startOfMonth).length;

    const allRequests = await getAllDocs(COLLECTIONS.BUDDY_REQUESTS);
    const totalRequests = allRequests.length;
    const acceptedRequests = allRequests.filter(r => r.status === 'accepted').length;

    // Real charts data: Registrations, Sessions, Requests over last 7 days
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const trendData = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const startOfDay = `${dateStr}T00:00:00.000Z`;
      const endOfDay = new Date(new Date(startOfDay).getTime() + 24 * 60 * 60 * 1000).toISOString();

      const regCount = allUsers.filter(u => u.created_at && u.created_at >= startOfDay && u.created_at < endOfDay).length;
      const sessCount = allSessions.filter(s => s.start_at && s.start_at >= startOfDay && s.start_at < endOfDay).length;
      const reqCount = allRequests.filter(r => r.created_at && r.created_at >= startOfDay && r.created_at < endOfDay).length;

      trendData.push({
        day: days[d.getDay()],
        date: dateStr,
        registrations: regCount,
        sessions: sessCount,
        requests: reqCount
      });
    }

    // Role breakdown
    const roleCountMap = {};
    nonDeletedUsers.forEach(u => {
      const r = u.role || 'student';
      roleCountMap[r] = (roleCountMap[r] || 0) + 1;
    });
    const roleStats = Object.entries(roleCountMap).map(([role, c]) => ({ role, c }));

    // Settings
    const allSettings = await getAllDocs(COLLECTIONS.SETTINGS);
    const settingsMap = {};
    allSettings.forEach(s => {
      if (s.key) settingsMap[s.key] = s.value;
    });

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
    const rawSchools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const schools = rawSchools.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const rawPrograms = await getAllDocs(COLLECTIONS.PROGRAMS);
    const programs = rawPrograms.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const rawSkills = await getAllDocs(COLLECTIONS.SKILLS);
    const skills = rawSkills.sort((a, b) => ((a.category || '') + (a.name || '')).localeCompare((b.category || '') + (b.name || '')));

    const rawInterests = await getAllDocs(COLLECTIONS.INTERESTS);
    const interests = rawInterests.sort((a, b) => ((a.category || '') + (a.name || '')).localeCompare((b.category || '') + (b.name || '')));

    return res.json({ schools, programs, skills, interests });
  } catch (err) {
    console.error('getMasterDataAll error:', err);
    return res.status(500).json({ error: 'Failed to load master data.' });
  }
}

async function addMasterItem(req, res) {
  try {
    const adminId = req.user.userId;
    const { type, data } = req.body;

    if (type === 'school') {
      const id = data.id || `sch-${(data.code || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      await setDoc(COLLECTIONS.SCHOOLS, id, {
        id,
        name: data.name,
        code: data.code,
        semesters: Number(data.semesters) || 8
      });
    } else if (type === 'program') {
      const id = data.id || `prog-${uuidv4().slice(0, 8)}`;
      await setDoc(COLLECTIONS.PROGRAMS, id, {
        id,
        school_id: data.school_id,
        name: data.name,
        code: data.code
      });
    } else if (type === 'skill') {
      const id = `sk-${uuidv4().slice(0, 8)}`;
      await setDoc(COLLECTIONS.SKILLS, id, {
        skill_id: id,
        id,
        name: data.name,
        category: data.category || 'Technology',
        approved: 1
      });
    } else if (type === 'interest') {
      const id = `int-${uuidv4().slice(0, 8)}`;
      await setDoc(COLLECTIONS.INTERESTS, id, {
        interest_id: id,
        id,
        name: data.name,
        category: data.category || 'Academic',
        approved: 1
      });
    }

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: 'MASTER_DATA_ADD',
      details: `Added master ${type}: ${data.name}`,
      created_at: nowISO()
    });

    return res.status(201).json({ message: `${type} added successfully.` });
  } catch (err) {
    console.error('addMasterItem error:', err);
    return res.status(500).json({ error: err.message || 'Failed to add item.' });
  }
}

async function deleteMasterItem(req, res) {
  try {
    const adminId = req.user.userId;
    const { type, id } = req.body;

    if (type === 'school') {
      await deleteDoc(COLLECTIONS.SCHOOLS, id);
    } else if (type === 'program') {
      await deleteDoc(COLLECTIONS.PROGRAMS, id);
    } else if (type === 'skill') {
      await deleteDoc(COLLECTIONS.SKILLS, id);
    } else if (type === 'interest') {
      await deleteDoc(COLLECTIONS.INTERESTS, id);
    }

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: 'MASTER_DATA_DELETE',
      details: `Deleted master ${type}: ${id}`,
      created_at: nowISO()
    });

    return res.json({ message: `${type} deleted successfully.` });
  } catch (err) {
    console.error('deleteMasterItem error:', err);
    return res.status(500).json({ error: 'Failed to delete item.' });
  }
}

// Announcements endpoints
async function getAnnouncements(req, res) {
  try {
    const banner = await getDoc(COLLECTIONS.SETTINGS, 'announcement_banner');
    return res.json({ announcement: banner ? banner.value : '' });
  } catch (err) {
    console.error('getAnnouncements error:', err);
    return res.status(500).json({ error: 'Failed to load announcements.' });
  }
}

async function saveAnnouncement(req, res) {
  try {
    const adminId = req.user.userId;
    const { announcement } = req.body;

    await setDoc(COLLECTIONS.SETTINGS, 'announcement_banner', {
      key: 'announcement_banner',
      value: announcement || ''
    });

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: 'ANNOUNCEMENT_UPDATED',
      details: announcement ? `Updated banner: ${announcement}` : 'Cleared banner',
      created_at: nowISO()
    });

    return res.json({ message: 'Announcement banner updated successfully.' });
  } catch (err) {
    console.error('saveAnnouncement error:', err);
    return res.status(500).json({ error: 'Failed to update announcement.' });
  }
}

// GET /api/admin/users
async function getUsers(req, res) {
  try {
    const { q, role, status } = req.query;

    const allUsers = await getAllDocs(COLLECTIONS.USERS);
    const programs = await getAllDocs(COLLECTIONS.PROGRAMS);
    const progMap = new Map(programs.map(p => [p.id, p.name]));
    const schools = await getAllDocs(COLLECTIONS.SCHOOLS);
    const schoolMap = new Map(schools.map(s => [s.id, s.name]));

    let filtered = allUsers;

    if (role) {
      filtered = filtered.filter(u => u.role === role);
    }
    if (status) {
      filtered = filtered.filter(u => u.status === status);
    }

    const users = [];
    for (const u of filtered) {
      const uId = u.user_id || u.id;
      let sp = null;
      let stp = null;

      if (u.role === 'student') {
        sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, uId);
      } else {
        stp = await getDoc(COLLECTIONS.STAFF_PROFILES, uId);
      }

      const fullName = (sp && sp.full_name) || (stp && stp.full_name) || 'Unknown';
      const programName = sp && sp.program_id ? (progMap.get(sp.program_id) || null) : null;
      const schoolName = sp && sp.school_id ? (schoolMap.get(sp.school_id) || null) : null;

      if (q) {
        const qLower = q.toLowerCase();
        const emailMatch = u.email && u.email.toLowerCase().includes(qLower);
        const sapMatch = u.sap_id && String(u.sap_id).toLowerCase().includes(qLower);
        const nameMatch = fullName.toLowerCase().includes(qLower);
        if (!emailMatch && !sapMatch && !nameMatch) {
          continue;
        }
      }

      users.push({
        user_id: uId,
        sap_id: u.sap_id || null,
        email: u.email,
        role: u.role,
        status: u.status,
        email_verified: u.email_verified || 1,
        created_at: u.created_at,
        last_login: u.last_login || null,
        full_name: fullName,
        program_name: programName,
        school_name: schoolName
      });
    }

    users.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return res.json({ users });
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
    const { status, role } = req.body;

    if (status) {
      if (status === 'deleted') {
        // Anonymization
        const sp = await getDoc(COLLECTIONS.STUDENT_PROFILES, userId);
        if (sp) {
          await updateDoc(COLLECTIONS.STUDENT_PROFILES, userId, {
            full_name: 'Former Student',
            bio: null,
            photo_url: null
          });
        }

        const stp = await getDoc(COLLECTIONS.STAFF_PROFILES, userId);
        if (stp) {
          await updateDoc(COLLECTIONS.STAFF_PROFILES, userId, {
            full_name: 'Former Staff',
            expertise: null,
            photo_url: null
          });
        }

        await updateDoc(COLLECTIONS.USERS, userId, {
          status: 'deleted',
          sap_id: null
        });

        const logId = uuidv4();
        await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
          log_id: logId,
          actor_id: adminId,
          action: 'USER_DELETED_ANONYMIZED',
          target: userId,
          details: 'User marked deleted and personal data anonymized',
          created_at: nowISO()
        });

        return res.json({ message: 'User deleted and profile anonymized.' });
      } else {
        await updateDoc(COLLECTIONS.USERS, userId, { status });

        const logId = uuidv4();
        await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
          log_id: logId,
          actor_id: adminId,
          action: 'USER_STATUS_CHANGE',
          target: userId,
          details: `Status changed to ${status}`,
          created_at: nowISO()
        });

        return res.json({ message: `User status changed to ${status}.` });
      }
    }

    if (role) {
      await updateDoc(COLLECTIONS.USERS, userId, { role });

      const logId = uuidv4();
      await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
        log_id: logId,
        actor_id: adminId,
        action: 'USER_ROLE_CHANGE',
        target: userId,
        details: `Role updated to ${role}`,
        created_at: nowISO()
      });

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
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'A list of students is required for bulk import.' });
    }

    let imported = 0;
    const generatedCredentials = [];
    const allUsers = await getAllDocs(COLLECTIONS.USERS);

    for (const s of students) {
      if (!s.email || !s.sapId) continue;
      const email = s.email.trim().toLowerCase();
      const sapId = String(s.sapId).trim();

      const exists = allUsers.some(u => u.email === email || (u.sap_id && String(u.sap_id) === sapId));
      if (!exists) {
        const tempPassword = `PB@${crypto.randomBytes(4).toString('hex')}!${Math.floor(10 + Math.random() * 90)}`;
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const userId = uuidv4();
        const now = nowISO();

        await setDoc(COLLECTIONS.USERS, userId, {
          user_id: userId,
          sap_id: sapId,
          email,
          password_hash: passwordHash,
          role: 'student',
          status: 'active',
          email_verified: 1,
          created_at: now
        });

        await setDoc(COLLECTIONS.STUDENT_PROFILES, userId, {
          user_id: userId,
          full_name: s.fullName || 'Student',
          semester: Number(s.semester) || 1,
          profile_completeness: 30
        });

        imported++;
        generatedCredentials.push({
          email,
          sapId,
          temporaryPassword: tempPassword
        });
      }
    }

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: 'BULK_USER_IMPORT',
      details: `Bulk imported ${imported} students`,
      created_at: nowISO()
    });

    return res.json({
      message: `Successfully imported ${imported} students.`,
      count: imported,
      credentials: generatedCredentials
    });
  } catch (err) {
    console.error('bulkImportUsers error:', err);
    return res.status(500).json({ error: 'Bulk import failed.' });
  }
}

// GET /api/admin/reports
async function getReports(req, res) {
  try {
    const allReports = await getAllDocs(COLLECTIONS.REPORTS);
    const reports = [];

    for (const r of allReports) {
      const repUser = await getDoc(COLLECTIONS.USERS, r.reporter_id);
      const repSp = await getDoc(COLLECTIONS.STUDENT_PROFILES, r.reporter_id);

      const trgUser = await getDoc(COLLECTIONS.USERS, r.reported_user_id);
      const trgSp = await getDoc(COLLECTIONS.STUDENT_PROFILES, r.reported_user_id);

      reports.push({
        ...r,
        reporter_email: repUser ? repUser.email : null,
        reporter_name: repSp ? repSp.full_name : 'Reporter',
        target_email: trgUser ? trgUser.email : null,
        target_name: trgSp ? trgSp.full_name : 'Reported Student'
      });
    }

    reports.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return res.json({ reports });
  } catch (err) {
    console.error('getReports error:', err);
    return res.status(500).json({ error: 'Failed to fetch moderation reports.' });
  }
}

// POST /api/admin/reports/:reportId/action
async function handleReportAction(req, res) {
  try {
    const adminId = req.user.userId;
    const { reportId } = req.params;
    const { action, suspendDays, notes } = req.body;

    const report = await getDoc(COLLECTIONS.REPORTS, reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    if (action === 'suspend' || action === 'ban') {
      await updateDoc(COLLECTIONS.USERS, report.reported_user_id, { status: 'suspended' });
    }

    const finalStatus = action === 'dismiss' ? 'Closed' : 'Action taken';
    await updateDoc(COLLECTIONS.REPORTS, reportId, {
      status: finalStatus,
      handled_by: adminId,
      action_taken: `${action.toUpperCase()}: ${notes || 'No extra notes'}`,
      updated_at: nowISO()
    });

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: `REPORT_ACTION_${action.toUpperCase()}`,
      target: report.reported_user_id,
      details: notes || '',
      created_at: nowISO()
    });

    return res.json({ message: `Action ${action} executed and logged.` });
  } catch (err) {
    console.error('handleReportAction error:', err);
    return res.status(500).json({ error: 'Failed to execute moderation action.' });
  }
}

// GET /api/admin/audit-log
async function getAuditLog(req, res) {
  try {
    const allLogs = await getAllDocs(COLLECTIONS.AUDIT_LOG);
    allLogs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const recentLogs = allLogs.slice(0, 100);

    const auditLog = [];
    for (const al of recentLogs) {
      const actor = al.actor_id ? await getDoc(COLLECTIONS.USERS, al.actor_id) : null;
      auditLog.push({
        ...al,
        actor_email: actor ? actor.email : null
      });
    }

    return res.json({ auditLog });
  } catch (err) {
    console.error('getAuditLog error:', err);
    return res.status(500).json({ error: 'Failed to load audit logs.' });
  }
}

// POST /api/admin/settings
async function updateSettings(req, res) {
  try {
    const adminId = req.user.userId;
    const { settings } = req.body;

    if (typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload.' });
    }

    for (const [key, val] of Object.entries(settings)) {
      await setDoc(COLLECTIONS.SETTINGS, key, {
        key,
        value: String(val)
      });
    }

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: 'SETTINGS_UPDATED',
      details: 'Updated match weights / system settings',
      created_at: nowISO()
    });

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
    await setDoc(COLLECTIONS.SKILLS, skillId, {
      skill_id: skillId,
      id: skillId,
      name: name.trim(),
      category: category.trim(),
      approved: 1
    });

    return res.status(201).json({ message: 'Skill created', skillId });
  } catch (err) {
    console.error('createMasterSkill error:', err);
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

    const allUsers = await getAllDocs(COLLECTIONS.USERS);
    const existing = allUsers.find(u => u.email === trimmedEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const now = nowISO();

    await setDoc(COLLECTIONS.USERS, userId, {
      user_id: userId,
      sap_id: sapId ? sapId.trim() : null,
      email: trimmedEmail,
      password_hash: passwordHash,
      role,
      status: 'active',
      email_verified: 1,
      created_at: now
    });

    if (role === 'student') {
      await setDoc(COLLECTIONS.STUDENT_PROFILES, userId, {
        user_id: userId,
        full_name: fullName.trim(),
        profile_completeness: 50
      });
    } else {
      await setDoc(COLLECTIONS.STAFF_PROFILES, userId, {
        user_id: userId,
        full_name: fullName.trim(),
        department: department ? department.trim() : 'Academic Department',
        designation: designation ? designation.trim() : (role === 'mentor' ? 'Academic Mentor' : role === 'faculty' ? 'Faculty Member' : 'Administrator'),
        expertise: `${role.charAt(0).toUpperCase() + role.slice(1)} at NMIMS`
      });
    }

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: 'ADMIN_USER_PROVISIONED',
      target: trimmedEmail,
      details: `Admin provisioned ${role} account for ${fullName.trim()} (${trimmedEmail})`,
      created_at: now
    });

    return res.status(201).json({ message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully.`, userId });
  } catch (err) {
    console.error('createUser error:', err);
    return res.status(500).json({ error: 'Failed to create user.' });
  }
}

// POST /api/admin/email-diagnostic
async function sendEmailDiagnostic(req, res) {
  try {
    const { to } = req.body;
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return res.status(400).json({ error: 'Valid recipient email address is required.' });
    }

    const { sendEmail } = require('../utils/emailService');
    const result = await sendEmail({
      to: to.trim().toLowerCase(),
      subject: 'NMIMS Peer Buddy — Live Email System Diagnostic Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #E5E7EB; border-radius: 8px;">
          <h2 style="color: #E4574C;">NMIMS Peer Buddy — Email Service Live</h2>
          <p>This is a live diagnostic test message sent from the Peer Buddy API.</p>
          <p><strong>Recipient:</strong> ${to.trim().toLowerCase()}</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p style="color: green; font-weight: bold;">✓ Email configuration verified successfully.</p>
        </div>
      `,
      text: `NMIMS Peer Buddy Email Diagnostic Test sent to ${to.trim().toLowerCase()} at ${new Date().toISOString()}`
    });

    if (result.sent) {
      return res.json({
        success: true,
        message: `Diagnostic email accepted by ${result.provider}.`,
        provider: result.provider,
        id: result.id
      });
    } else {
      return res.status(502).json({
        success: false,
        error: result.error || 'Failed to deliver diagnostic email'
      });
    }
  } catch (err) {
    console.error('sendEmailDiagnostic error:', err);
    return res.status(500).json({ error: err.message || 'Diagnostic execution failed.' });
  }
}

// POST /api/admin/allocate-student
async function allocateStudentMentor(req, res) {
  try {
    const adminId = req.user.userId;
    const { studentId, mentorId } = req.body;

    if (!studentId || !mentorId) {
      return res.status(400).json({ error: 'Student ID and Mentor ID are required.' });
    }

    const studentUser = await getDoc(COLLECTIONS.USERS, studentId);
    if (!studentUser || studentUser.role !== 'student' || studentUser.status !== 'active') {
      return res.status(404).json({ error: 'Active student not found.' });
    }

    const mentorUser = await getDoc(COLLECTIONS.USERS, mentorId);
    if (!mentorUser || mentorUser.role !== 'mentor' || mentorUser.status !== 'active') {
      return res.status(404).json({ error: 'Active mentor not found.' });
    }

    await updateDoc(COLLECTIONS.STUDENT_PROFILES, studentId, { mentor_id: mentorId });

    // Check active connection
    const connsA = await queryDocs(COLLECTIONS.CONNECTIONS, [
      ['user_a', '==', studentId],
      ['user_b', '==', mentorId]
    ]);
    const connsB = await queryDocs(COLLECTIONS.CONNECTIONS, [
      ['user_a', '==', mentorId],
      ['user_b', '==', studentId]
    ]);
    const existing = [...connsA, ...connsB].filter(c => c.status === 'active');

    let connectionId = existing.length > 0 ? (existing[0].connection_id || existing[0].id) : null;
    if (!connectionId) {
      connectionId = uuidv4();
      await setDoc(COLLECTIONS.CONNECTIONS, connectionId, {
        connection_id: connectionId,
        user_a: studentId,
        user_b: mentorId,
        status: 'active',
        created_at: nowISO()
      });
    }

    const logId = uuidv4();
    await setDoc(COLLECTIONS.AUDIT_LOG, logId, {
      log_id: logId,
      actor_id: adminId,
      action: 'STUDENT_MENTOR_ALLOCATED',
      target: studentId,
      details: `Allocated student ${studentId} to mentor ${mentorId}`,
      created_at: nowISO()
    });

    return res.json({
      message: 'Student successfully allocated to mentor.',
      studentId,
      mentorId,
      connectionId
    });
  } catch (err) {
    console.error('allocateStudentMentor error:', err);
    return res.status(500).json({ error: 'Failed to allocate student to mentor.' });
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
  saveAnnouncement,
  sendEmailDiagnostic,
  allocateStudentMentor
};

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./db');
const migrate = require('./migrate');

async function seedMasterData() {
  // Ensure tables exist
  await migrate();

  // 1. Seed Settings only if empty
  const existingSettings = await query('SELECT COUNT(*) as c FROM settings');
  if (parseInt(existingSettings.rows[0].c, 10) === 0) {
    const defaultSettings = [
      ['weight_skills', '40'],
      ['weight_complementary', '25'],
      ['weight_availability', '20'],
      ['weight_school_sem', '10'],
      ['weight_rating', '5'],
      ['max_pending_requests', '10'],
      ['review_all_requests', '0'],
      ['announcement_banner', 'Welcome to Peer Buddy System – NMIMS Intra-College Collaboration Platform.']
    ];

    for (const [key, val] of defaultSettings) {
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', [key, val]);
    }
  }

  // 2. Seed Schools only if empty
  const existingSchools = await query('SELECT COUNT(*) as c FROM schools');
  if (parseInt(existingSchools.rows[0].c, 10) === 0) {
    const schools = [
      { id: 'sch-stme', name: 'School of Technology Management and Engineering (STME)', code: 'STME', semesters: 8 },
      { id: 'sch-sptm', name: 'Shobhaben Pratapbhai Patel School of Pharmacy & Technology Management (SPTM)', code: 'SPTM', semesters: 10 },
      { id: 'sch-sol', name: 'Kirit P. Mehta School of Law (SOL)', code: 'SOL', semesters: 10 },
      { id: 'sch-sbm', name: 'School of Business Management (SBM)', code: 'SBM', semesters: 4 },
      { id: 'sch-soc', name: 'School of Commerce (SOC)', code: 'SOC', semesters: 6 }
    ];

    for (const s of schools) {
      await query('INSERT INTO schools (id, name, code, semesters) VALUES (?, ?, ?, ?)', [s.id, s.name, s.code, s.semesters]);
    }
  }

  // 3. Seed Programs only if empty
  const existingPrograms = await query('SELECT COUNT(*) as c FROM programs');
  if (parseInt(existingPrograms.rows[0].c, 10) === 0) {
    const programs = [
      { id: 'prog-csds', school_id: 'sch-stme', name: 'B.Tech Computer Science & Data Science (CSDS)', code: 'BTECH-CSDS' },
      { id: 'prog-aiml', school_id: 'sch-stme', name: 'B.Tech Artificial Intelligence & Machine Learning', code: 'BTECH-AIML' },
      { id: 'prog-cse', school_id: 'sch-stme', name: 'B.Tech Computer Engineering (CS)', code: 'BTECH-CE' },
      { id: 'prog-it', school_id: 'sch-stme', name: 'B.Tech Information Technology', code: 'BTECH-IT' },
      { id: 'prog-mba-core', school_id: 'sch-sbm', name: 'MBA Core', code: 'MBA-CORE' },
      { id: 'prog-mba-tech', school_id: 'sch-stme', name: 'MBA Tech Computer Science', code: 'MBA-TECH-CS' }
    ];

    for (const p of programs) {
      await query('INSERT INTO programs (id, school_id, name, code) VALUES (?, ?, ?, ?)', [p.id, p.school_id, p.name, p.code]);
    }
  }

  // 4. Seed Skills only if empty
  const existingSkills = await query('SELECT COUNT(*) as c FROM skills');
  if (parseInt(existingSkills.rows[0].c, 10) === 0) {
    const starterSkills = [
      { id: 'sk-1', name: 'Data Analytics', category: 'Technology' },
      { id: 'sk-2', name: 'Python Programming', category: 'Technology' },
      { id: 'sk-3', name: 'Machine Learning', category: 'Technology' },
      { id: 'sk-4', name: 'Web Development (React / Node.js)', category: 'Technology' },
      { id: 'sk-5', name: 'Data Structures & Algorithms', category: 'Academics' },
      { id: 'sk-6', name: 'Database Management (SQL)', category: 'Technology' },
      { id: 'sk-7', name: 'Linear Algebra & Calculus', category: 'Academics' },
      { id: 'sk-8', name: 'Financial Modeling', category: 'Business' },
      { id: 'sk-9', name: 'Marketing Management', category: 'Business' },
      { id: 'sk-10', name: 'Software Engineering', category: 'Academics' }
    ];

    for (const sk of starterSkills) {
      await query('INSERT INTO skills (skill_id, name, category, approved) VALUES (?, ?, ?, 1)', [sk.id, sk.name, sk.category]);
    }
  }

  // 5. Seed Interests only if empty
  const existingInterests = await query('SELECT COUNT(*) as c FROM interests');
  if (parseInt(existingInterests.rows[0].c, 10) === 0) {
    const starterInterests = [
      { id: 'int-1', name: 'Hackathons & Coding Competitions', category: 'Extracurricular' },
      { id: 'int-2', name: 'Research Paper Publishing', category: 'Academics' },
      { id: 'int-3', name: 'Competitive Programming', category: 'Extracurricular' },
      { id: 'int-4', name: 'Case Study Competitions', category: 'Business' },
      { id: 'int-5', name: 'Open Source Contribution', category: 'Technology' },
      { id: 'int-6', name: 'Robotics & IoT Projects', category: 'Technology' }
    ];

    for (const it of starterInterests) {
      await query('INSERT INTO interests (interest_id, name, category, approved) VALUES (?, ?, ?, 1)', [it.id, it.name, it.category]);
    }
  }
}

async function ensureBootstrapAdmin() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator';

  if (!adminEmail || !adminPassword) {
    console.log('BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD not set. Skipping admin bootstrap.');
    return;
  }

  const existingAdmin = await query("SELECT user_id, email FROM users WHERE role = 'admin' LIMIT 1");
  if (existingAdmin.rowCount === 0) {
    console.log(`Creating initial bootstrap admin (${adminEmail})...`);
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const userId = uuidv4();

    await query(
      `INSERT INTO users (user_id, email, password_hash, role, status, email_verified)
       VALUES (?, ?, ?, 'admin', 'active', 1)`,
      [userId, adminEmail.trim().toLowerCase(), passwordHash]
    );

    await query(
      `INSERT INTO staff_profiles (user_id, full_name, department, designation, expertise)
       VALUES (?, ?, 'Administration', 'System Administrator', 'System Administration')`,
      [userId, adminName.trim()]
    );
    console.log(`✓ Bootstrap admin (${adminEmail}) created successfully.`);
  }
}

async function seed() {
  await seedMasterData();
  await ensureBootstrapAdmin();
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error('Seed script error:', err);
    process.exit(1);
  });
}

module.exports = seed;
module.exports.seedMasterData = seedMasterData;
module.exports.ensureBootstrapAdmin = ensureBootstrapAdmin;

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./db');
const migrate = require('./migrate');

async function seed() {
  console.log('Seeding master data and 4 required test accounts...');
  
  // Ensure tables exist
  await migrate();

  // 1. Seed Settings (Match weights from doc: skills 40, complementary 25, availability 20, school/sem 10, rating 5)
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
    const existing = await query('SELECT key FROM settings WHERE key = ?', [key]);
    if (existing.rowCount === 0) {
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', [key, val]);
    }
  }

  // 2. Seed NMIMS Schools (FIX 1: STME 8, SPTM 10, SOL 10, SBM 4, SOC 6)
  const schools = [
    { id: 'sch-stme', name: 'School of Technology Management and Engineering (STME)', code: 'STME', semesters: 8 },
    { id: 'sch-sptm', name: 'Shobhaben Pratapbhai Patel School of Pharmacy & Technology Management (SPTM)', code: 'SPTM', semesters: 10 },
    { id: 'sch-sol', name: 'Kirit P. Mehta School of Law (SOL)', code: 'SOL', semesters: 10 },
    { id: 'sch-sbm', name: 'School of Business Management (SBM)', code: 'SBM', semesters: 4 },
    { id: 'sch-soc', name: 'School of Commerce (SOC)', code: 'SOC', semesters: 6 }
  ];

  for (const s of schools) {
    const existing = await query('SELECT id FROM schools WHERE id = ? OR code = ?', [s.id, s.code]);
    if (existing.rowCount === 0) {
      await query('INSERT INTO schools (id, name, code, semesters) VALUES (?, ?, ?, ?)', [s.id, s.name, s.code, s.semesters]);
    } else {
      await query('UPDATE schools SET name = ?, code = ?, semesters = ? WHERE id = ? OR code = ?', [s.name, s.code, s.semesters, s.id, s.code]);
    }
  }

  // 3. Seed NMIMS Programs
  const programs = [
    { id: 'prog-csds', school_id: 'sch-stme', name: 'B.Tech Computer Science & Data Science (CSDS)', code: 'BTECH-CSDS' },
    { id: 'prog-aiml', school_id: 'sch-stme', name: 'B.Tech Artificial Intelligence & Machine Learning', code: 'BTECH-AIML' },
    { id: 'prog-cse', school_id: 'sch-mpstme', name: 'B.Tech Computer Engineering', code: 'BTECH-CE' },
    { id: 'prog-it', school_id: 'sch-mpstme', name: 'B.Tech Information Technology', code: 'BTECH-IT' },
    { id: 'prog-mba-core', school_id: 'sch-sbm', name: 'MBA Core', code: 'MBA-CORE' },
    { id: 'prog-mba-tech', school_id: 'sch-stme', name: 'MBA Tech Computer Science', code: 'MBA-TECH-CS' }
  ];

  for (const p of programs) {
    const existing = await query('SELECT id FROM programs WHERE id = ?', [p.id]);
    if (existing.rowCount === 0) {
      await query('INSERT INTO programs (id, school_id, name, code) VALUES (?, ?, ?, ?)', [p.id, p.school_id, p.name, p.code]);
    }
  }

  // 4. Seed Master Skills
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
    const existing = await query('SELECT skill_id FROM skills WHERE skill_id = ?', [sk.id]);
    if (existing.rowCount === 0) {
      await query('INSERT INTO skills (skill_id, name, category, approved) VALUES (?, ?, ?, 1)', [sk.id, sk.name, sk.category]);
    }
  }

  // 5. Seed Master Interests
  const starterInterests = [
    { id: 'int-1', name: 'Hackathons & Coding Competitions', category: 'Extracurricular' },
    { id: 'int-2', name: 'Research Paper Publishing', category: 'Academics' },
    { id: 'int-3', name: 'Competitive Programming', category: 'Extracurricular' },
    { id: 'int-4', name: 'Case Study Competitions', category: 'Business' },
    { id: 'int-5', name: 'Open Source Contribution', category: 'Technology' },
    { id: 'int-6', name: 'Robotics & IoT Projects', category: 'Technology' }
  ];

  for (const it of starterInterests) {
    const existing = await query('SELECT interest_id FROM interests WHERE interest_id = ?', [it.id]);
    if (existing.rowCount === 0) {
      await query('INSERT INTO interests (interest_id, name, category, approved) VALUES (?, ?, ?, 1)', [it.id, it.name, it.category]);
    }
  }

  // 6. Seed Exactly the 4 Required Test Accounts
  // Passwords hashed with bcrypt
  // Student: student@nmims.in / Student@123 (SAP ID 70000000001)
  // Mentor: mentor@nmims.in / Mentor@123
  // Faculty: faculty@nmims.in / Faculty@123
  // Administrator: admin@nmims.in / Admin@123
  const studentHash = await bcrypt.hash('Student@123', 10);
  const mentorHash = await bcrypt.hash('Mentor@123', 10);
  const facultyHash = await bcrypt.hash('Faculty@123', 10);
  const adminHash = await bcrypt.hash('Admin@123', 10);

  const testAccounts = [
    {
      userId: 'usr-student-1',
      sapId: '70000000001',
      email: 'student@nmims.in',
      hash: studentHash,
      role: 'student',
      name: 'Aditi Sharma',
      schoolId: 'sch-stme',
      programId: 'prog-csds',
      semester: 3,
      year: 2,
      bio: 'Second-year CSDS student interested in Data Analytics and Machine Learning.',
      department: null,
      designation: null
    },
    {
      userId: 'usr-mentor-1',
      sapId: null,
      email: 'mentor@nmims.in',
      hash: mentorHash,
      role: 'mentor',
      name: 'Dr. Rajesh Deshmukh',
      schoolId: null,
      programId: null,
      semester: null,
      year: null,
      bio: 'Senior Mentor & Alumnus guiding students on academic projects and data science.',
      department: 'Computer Engineering & Data Science',
      designation: 'Senior Technical Mentor'
    },
    {
      userId: 'usr-faculty-1',
      sapId: null,
      email: 'faculty@nmims.in',
      hash: facultyHash,
      role: 'faculty',
      name: 'Prof. Ananya Iyer',
      schoolId: null,
      programId: null,
      semester: null,
      year: null,
      bio: 'Faculty member in Department of Computer Science & Engineering.',
      department: 'Computer Science & Engineering',
      designation: 'Assistant Professor'
    },
    {
      userId: 'usr-admin-1',
      sapId: null,
      email: 'admin@nmims.in',
      hash: adminHash,
      role: 'admin',
      name: 'NMIMS System Administrator',
      schoolId: null,
      programId: null,
      semester: null,
      year: null,
      bio: 'Student Affairs & Academic Systems Administration.',
      department: 'Academic IT & Student Affairs',
      designation: 'System Administrator'
    }
  ];

  for (const acc of testAccounts) {
    const existing = await query('SELECT user_id FROM users WHERE email = ?', [acc.email]);
    if (existing.rowCount === 0) {
      await query(
        `INSERT INTO users (user_id, sap_id, email, password_hash, role, status, email_verified)
         VALUES (?, ?, ?, ?, ?, 'active', 1)`,
        [acc.userId, acc.sapId, acc.email, acc.hash, acc.role]
      );

      if (acc.role === 'student') {
        await query(
          `INSERT INTO student_profiles 
           (user_id, full_name, school_id, program_id, semester, year, bio, study_mode, open_to_requests, show_email, show_availability, profile_completeness)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'both', 1, 0, 1, 85)`,
          [acc.userId, acc.name, acc.schoolId, acc.programId, acc.semester, acc.year, acc.bio]
        );

        // Assign initial skills and availability for the student test account
        await query(`INSERT INTO user_skills (id, user_id, skill_id, type, level) VALUES (?, ?, ?, 'has', 'intermediate')`, [uuidv4(), acc.userId, 'sk-1']);
        await query(`INSERT INTO user_skills (id, user_id, skill_id, type, level) VALUES (?, ?, ?, 'wants_to_learn', 'beginner')`, [uuidv4(), acc.userId, 'sk-3']);
        await query(`INSERT INTO user_interests (id, user_id, interest_id) VALUES (?, ?, ?)`, [uuidv4(), acc.userId, 'int-1']);
        
        await query(`INSERT INTO availability (availability_id, user_id, day_of_week, start_time, end_time) VALUES (?, ?, 'Tuesday', '17:00', '19:00')`, [uuidv4(), acc.userId]);
        await query(`INSERT INTO availability (availability_id, user_id, day_of_week, start_time, end_time) VALUES (?, ?, 'Thursday', '17:00', '19:00')`, [uuidv4(), acc.userId]);
      } else {
        await query(
          `INSERT INTO staff_profiles (user_id, full_name, department, designation, expertise)
           VALUES (?, ?, ?, ?, ?)`,
          [acc.userId, acc.name, acc.department, acc.designation, acc.bio]
        );
      }
    }
  }

  console.log('Seeding finished successfully. Exactly 4 test accounts and master data created.');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((err) => {
    console.error('Seed script error:', err);
    process.exit(1);
  });
}

module.exports = seed;

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  getDoc,
  setDoc,
  countDocs,
  queryDocs,
  nowISO
} = require('./firestoreDb');

async function seedMasterData() {
  console.log('[Seed] Checking Firestore master data...');

  // 1. Seed Settings if empty
  try {
    const settingsCount = await countDocs(COLLECTIONS.SETTINGS);
    if (settingsCount === 0) {
      console.log('[Seed] Seeding default settings into Firestore...');
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
        await setDoc(COLLECTIONS.SETTINGS, key, { key, value: val });
      }
      console.log('[Seed] Settings seeded.');
    }
  } catch (err) {
    console.error('[Seed] Error checking/seeding settings:', err.message);
  }

  // 2. Seed Schools if empty
  try {
    const schoolsCount = await countDocs(COLLECTIONS.SCHOOLS);
    if (schoolsCount === 0) {
      console.log('[Seed] Seeding schools into Firestore...');
      const schools = [
        { id: 'sch-stme', name: 'School of Technology Management and Engineering (STME)', code: 'STME', semesters: 8 },
        { id: 'sch-sptm', name: 'Shobhaben Pratapbhai Patel School of Pharmacy & Technology Management (SPTM)', code: 'SPTM', semesters: 10 },
        { id: 'sch-sol', name: 'Kirit P. Mehta School of Law (SOL)', code: 'SOL', semesters: 10 },
        { id: 'sch-sbm', name: 'School of Business Management (SBM)', code: 'SBM', semesters: 4 },
        { id: 'sch-soc', name: 'School of Commerce (SOC)', code: 'SOC', semesters: 6 }
      ];

      for (const s of schools) {
        await setDoc(COLLECTIONS.SCHOOLS, s.id, s);
      }
      console.log('[Seed] Schools seeded.');
    }
  } catch (err) {
    console.error('[Seed] Error checking/seeding schools:', err.message);
  }

  // 3. Seed Programs if empty
  try {
    const programsCount = await countDocs(COLLECTIONS.PROGRAMS);
    if (programsCount === 0) {
      console.log('[Seed] Seeding programs into Firestore...');
      const programs = [
        { id: 'prog-csds', school_id: 'sch-stme', name: 'B.Tech Computer Science & Data Science (CSDS)', code: 'BTECH-CSDS' },
        { id: 'prog-aiml', school_id: 'sch-stme', name: 'B.Tech Artificial Intelligence & Machine Learning', code: 'BTECH-AIML' },
        { id: 'prog-cse', school_id: 'sch-stme', name: 'B.Tech Computer Engineering (CS)', code: 'BTECH-CE' },
        { id: 'prog-it', school_id: 'sch-stme', name: 'B.Tech Information Technology', code: 'BTECH-IT' },
        { id: 'prog-ca', school_id: 'sch-stme', name: 'Computer Applications (CA)', code: 'CA' },
        { id: 'prog-csgs', school_id: 'sch-stme', name: 'Computer Science and Cyber Security (CSGS)', code: 'CSGS' },
        { id: 'prog-mba-core', school_id: 'sch-sbm', name: 'MBA Core', code: 'MBA-CORE' },
        { id: 'prog-mba-tech', school_id: 'sch-stme', name: 'MBA Tech Computer Science', code: 'MBA-TECH-CS' }
      ];

      for (const p of programs) {
        await setDoc(COLLECTIONS.PROGRAMS, p.id, p);
      }
      console.log('[Seed] Programs seeded.');
    }
  } catch (err) {
    console.error('[Seed] Error checking/seeding programs:', err.message);
  }

  // 4. Seed Skills if empty
  try {
    const skillsCount = await countDocs(COLLECTIONS.SKILLS);
    if (skillsCount === 0) {
      console.log('[Seed] Seeding skills into Firestore...');
      const starterSkills = [
        { skill_id: 'sk-1', name: 'Data Analytics', category: 'Technology', approved: 1 },
        { skill_id: 'sk-2', name: 'Python Programming', category: 'Technology', approved: 1 },
        { skill_id: 'sk-3', name: 'Machine Learning', category: 'Technology', approved: 1 },
        { skill_id: 'sk-4', name: 'Web Development (React / Node.js)', category: 'Technology', approved: 1 },
        { skill_id: 'sk-5', name: 'Data Structures & Algorithms', category: 'Academics', approved: 1 },
        { skill_id: 'sk-6', name: 'Database Management (SQL)', category: 'Technology', approved: 1 },
        { skill_id: 'sk-7', name: 'Linear Algebra & Calculus', category: 'Academics', approved: 1 },
        { skill_id: 'sk-8', name: 'Financial Modeling', category: 'Business', approved: 1 },
        { skill_id: 'sk-9', name: 'Marketing Management', category: 'Business', approved: 1 },
        { skill_id: 'sk-10', name: 'Software Engineering', category: 'Academics', approved: 1 }
      ];

      for (const sk of starterSkills) {
        await setDoc(COLLECTIONS.SKILLS, sk.skill_id, sk);
      }
      console.log('[Seed] Skills seeded.');
    }
  } catch (err) {
    console.error('[Seed] Error checking/seeding skills:', err.message);
  }

  // 5. Seed Interests if empty
  try {
    const interestsCount = await countDocs(COLLECTIONS.INTERESTS);
    if (interestsCount === 0) {
      console.log('[Seed] Seeding interests into Firestore...');
      const starterInterests = [
        { interest_id: 'int-1', name: 'Hackathons & Coding Competitions', category: 'Extracurricular', approved: 1 },
        { interest_id: 'int-2', name: 'Research Paper Publishing', category: 'Academics', approved: 1 },
        { interest_id: 'int-3', name: 'Competitive Programming', category: 'Extracurricular', approved: 1 },
        { interest_id: 'int-4', name: 'Case Study Competitions', category: 'Business', approved: 1 },
        { interest_id: 'int-5', name: 'Open Source Contribution', category: 'Technology', approved: 1 },
        { interest_id: 'int-6', name: 'Robotics & IoT Projects', category: 'Technology', approved: 1 }
      ];

      for (const it of starterInterests) {
        await setDoc(COLLECTIONS.INTERESTS, it.interest_id, it);
      }
      console.log('[Seed] Interests seeded.');
    }
  } catch (err) {
    console.error('[Seed] Error checking/seeding interests:', err.message);
  }
}

async function ensureBootstrapAdmin() {
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator';

  if (!adminEmail || !adminPassword) {
    console.log('[Seed] BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD not set. Skipping admin bootstrap.');
    return;
  }

  try {
    const normalizedEmail = adminEmail.trim().toLowerCase();
    const existingAdmins = await queryDocs(COLLECTIONS.USERS, [['role', '==', 'admin']]);

    if (existingAdmins.length === 0) {
      console.log(`[Seed] Creating initial bootstrap admin (${normalizedEmail})...`);
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const userId = uuidv4();
      const now = nowISO();

      await setDoc(COLLECTIONS.USERS, userId, {
        user_id: userId,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: 'admin',
        status: 'active',
        email_verified: 1,
        created_at: now
      });

      await setDoc(COLLECTIONS.STAFF_PROFILES, userId, {
        user_id: userId,
        full_name: adminName.trim(),
        department: 'Administration',
        designation: 'System Administrator',
        expertise: 'System Administration'
      });
      console.log(`[Seed] ✓ Bootstrap admin (${normalizedEmail}) created successfully.`);
    }
  } catch (err) {
    console.error('[Seed] Error ensuring bootstrap admin:', err.message);
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

const { exec } = require('./db');

async function migrate() {
  console.log('Running database migrations...');

  const schema = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      sap_id TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'mentor', 'faculty', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending', 'active', 'suspended', 'deleted')),
      email_verified INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER DEFAULT 0,
      lockout_until TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );

    -- Schools table
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      semesters INTEGER DEFAULT 8
    );

    -- Programs table
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );

    -- Student Profiles table
    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      school_id TEXT,
      program_id TEXT,
      semester INTEGER DEFAULT 1,
      year INTEGER DEFAULT 1,
      bio TEXT,
      photo_url TEXT,
      study_mode TEXT DEFAULT 'both' CHECK(study_mode IN ('online', 'on_campus', 'both')),
      open_to_requests INTEGER DEFAULT 1,
      show_email INTEGER DEFAULT 0,
      show_availability INTEGER DEFAULT 1,
      profile_completeness INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (school_id) REFERENCES schools(id),
      FOREIGN KEY (program_id) REFERENCES programs(id)
    );

    -- Staff Profiles table
    CREATE TABLE IF NOT EXISTS staff_profiles (
      user_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      department TEXT,
      designation TEXT,
      expertise TEXT,
      photo_url TEXT,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    -- Skills table
    CREATE TABLE IF NOT EXISTS skills (
      skill_id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      approved INTEGER DEFAULT 1,
      suggested_by TEXT
    );

    -- User Skills table
    CREATE TABLE IF NOT EXISTS user_skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('has', 'wants_to_learn')),
      level TEXT DEFAULT 'intermediate',
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE CASCADE,
      UNIQUE(user_id, skill_id, type)
    );

    -- Interests table
    CREATE TABLE IF NOT EXISTS interests (
      interest_id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      approved INTEGER DEFAULT 1,
      suggested_by TEXT
    );

    -- User Interests table
    CREATE TABLE IF NOT EXISTS user_interests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      interest_id TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (interest_id) REFERENCES interests(interest_id) ON DELETE CASCADE,
      UNIQUE(user_id, interest_id)
    );

    -- Availability table
    CREATE TABLE IF NOT EXISTS availability (
      availability_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      day_of_week TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    -- Buddy Requests table
    CREATE TABLE IF NOT EXISTS buddy_requests (
      request_id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      note TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
      needs_mentor_review INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      responded_at TEXT,
      FOREIGN KEY (sender_id) REFERENCES users(user_id),
      FOREIGN KEY (receiver_id) REFERENCES users(user_id)
    );

    -- Mentor Reviews table (for flagged requests)
    CREATE TABLE IF NOT EXISTS mentor_reviews (
      review_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      mentor_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('approved', 'rejected')),
      remarks TEXT,
      reviewed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES buddy_requests(request_id),
      FOREIGN KEY (mentor_id) REFERENCES users(user_id)
    );

    -- Connections table
    CREATE TABLE IF NOT EXISTS connections (
      connection_id TEXT PRIMARY KEY,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'ended')),
      created_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      FOREIGN KEY (user_a) REFERENCES users(user_id),
      FOREIGN KEY (user_b) REFERENCES users(user_id)
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      body TEXT,
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_type TEXT,
      status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read')),
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (connection_id) REFERENCES connections(connection_id),
      FOREIGN KEY (sender_id) REFERENCES users(user_id)
    );

    -- Study Sessions table
    CREATE TABLE IF NOT EXISTS study_sessions (
      session_id TEXT PRIMARY KEY,
      connection_id TEXT,
      organizer_id TEXT NOT NULL,
      partner_id TEXT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('online', 'on_campus')),
      location_or_link TEXT NOT NULL,
      status TEXT DEFAULT 'proposed' CHECK(status IN ('proposed', 'confirmed', 'declined', 'completed', 'cancelled')),
      department TEXT,
      semester INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (connection_id) REFERENCES connections(connection_id),
      FOREIGN KEY (organizer_id) REFERENCES users(user_id),
      FOREIGN KEY (partner_id) REFERENCES users(user_id)
    );

    -- Session Attendance table
    CREATE TABLE IF NOT EXISTS session_attendance (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      attended TEXT NOT NULL CHECK(attended IN ('yes', 'no')),
      marked_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES study_sessions(session_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      UNIQUE(session_id, user_id)
    );

    -- Reviews & Ratings table
    CREATE TABLE IF NOT EXISTS reviews (
      review_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      reviewee_id TEXT NOT NULL,
      punctuality INTEGER NOT NULL CHECK(punctuality BETWEEN 1 AND 5),
      helpfulness INTEGER NOT NULL CHECK(helpfulness BETWEEN 1 AND 5),
      communication INTEGER NOT NULL CHECK(communication BETWEEN 1 AND 5),
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (session_id) REFERENCES study_sessions(session_id),
      FOREIGN KEY (reviewer_id) REFERENCES users(user_id),
      FOREIGN KEY (reviewee_id) REFERENCES users(user_id),
      UNIQUE(session_id, reviewer_id)
    );

    -- Learning Resources table
    CREATE TABLE IF NOT EXISTS resources (
      resource_id TEXT PRIMARY KEY,
      mentor_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      semester INTEGER DEFAULT 1,
      file_url_or_link TEXT NOT NULL,
      description TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (mentor_id) REFERENCES users(user_id)
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    -- Reports table
    CREATE TABLE IF NOT EXISTS reports (
      report_id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      reported_user_id TEXT NOT NULL,
      message_id TEXT,
      reason TEXT NOT NULL CHECK(reason IN ('harassment', 'spam', 'fake_profile', 'inappropriate_content', 'other')),
      description TEXT,
      chat_excerpt TEXT,
      status TEXT DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under review', 'Action taken', 'Closed')),
      handled_by TEXT,
      action_taken TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (reporter_id) REFERENCES users(user_id),
      FOREIGN KEY (reported_user_id) REFERENCES users(user_id)
    );

    -- Audit Log table
    CREATE TABLE IF NOT EXISTS audit_log (
      log_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Settings table
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Password Reset Tokens table
    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Email Verification Tokens table
    CREATE TABLE IF NOT EXISTS email_verifications (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Guidance Messages from Mentors table
    CREATE TABLE IF NOT EXISTS guidance_messages (
      guidance_id TEXT PRIMARY KEY,
      mentor_id TEXT NOT NULL,
      subject TEXT,
      target_type TEXT NOT NULL CHECK(target_type IN ('student', 'subject', 'all')),
      target_id TEXT,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (mentor_id) REFERENCES users(user_id)
    );
  `;

  await exec(schema);
  
  // Safe migrations for newly added columns
  try {
    await exec(`ALTER TABLE schools ADD COLUMN semesters INTEGER DEFAULT 8;`);
  } catch (e) {
    // Column might already exist
  }

  try {
    await exec(`ALTER TABLE buddy_requests ADD COLUMN flag_reason TEXT DEFAULT 'Cross-year / academic gap';`);
  } catch (e) {
    // Column might already exist
  }

  try {
    await exec(`ALTER TABLE student_profiles ADD COLUMN mentor_id TEXT;`);
  } catch (e) {
    // Column might already exist
  }

  console.log('Database migrations completed successfully.');
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = migrate;

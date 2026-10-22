-- ====================================================================
-- Peer Buddy System – NMIMS PostgreSQL Production Schema
-- Derived strictly from Section 6 of Application Design Document
-- ====================================================================

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(64) PRIMARY KEY,
  sap_id VARCHAR(32) UNIQUE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL CHECK(role IN ('student', 'mentor', 'faculty', 'admin')),
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK(status IN ('pending', 'active', 'suspended', 'deleted')),
  email_verified INT NOT NULL DEFAULT 1,
  failed_login_attempts INT DEFAULT 0,
  lockout_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  CONSTRAINT chk_sap_id_format CHECK (
    sap_id IS NULL OR (sap_id ~ '^7[0-9]{10}$')
  ),
  CONSTRAINT chk_email_role_domain CHECK (
    (role = 'student' AND email ILIKE '%@nmims.in') OR
    (role IN ('faculty', 'mentor') AND (email ILIKE '%@nmims.edu' OR email ~* '@[a-z0-9.-]+\.nmims\.edu$')) OR
    (role = 'admin')
  )
);

-- Indexes specified in doc 6.2
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_sap_id ON users(sap_id);

-- 2. Schools table
CREATE TABLE IF NOT EXISTS schools (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  semesters INT DEFAULT 8
);

-- 3. Programs table
CREATE TABLE IF NOT EXISTS programs (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL
);

-- 4. Student Profiles table
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  school_id VARCHAR(64) REFERENCES schools(id),
  program_id VARCHAR(64) REFERENCES programs(id),
  semester INT DEFAULT 1,
  year INT DEFAULT 1,
  mentor_id VARCHAR(64),
  bio VARCHAR(250),
  photo_url TEXT,
  study_mode VARCHAR(32) DEFAULT 'both' CHECK(study_mode IN ('online', 'on_campus', 'both')),
  open_to_requests INT DEFAULT 1,
  show_email INT DEFAULT 0,
  show_availability INT DEFAULT 1,
  profile_completeness INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Staff Profiles table
CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  designation VARCHAR(255),
  expertise TEXT,
  photo_url TEXT
);

-- 6. Skills & User Skills
CREATE TABLE IF NOT EXISTS skills (
  skill_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(128) NOT NULL,
  approved INT DEFAULT 1,
  suggested_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS user_skills (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  skill_id VARCHAR(64) NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL CHECK(type IN ('has', 'wants_to_learn')),
  level VARCHAR(32) DEFAULT 'intermediate',
  UNIQUE(user_id, skill_id, type)
);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON user_skills(skill_id);

-- 7. Interests & User Interests
CREATE TABLE IF NOT EXISTS interests (
  interest_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(128) NOT NULL,
  approved INT DEFAULT 1,
  suggested_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS user_interests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  interest_id VARCHAR(64) NOT NULL REFERENCES interests(interest_id) ON DELETE CASCADE,
  UNIQUE(user_id, interest_id)
);

-- 8. Availability
CREATE TABLE IF NOT EXISTS availability (
  availability_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  day_of_week VARCHAR(32) NOT NULL,
  start_time VARCHAR(16) NOT NULL,
  end_time VARCHAR(16) NOT NULL
);

-- 9. Buddy Requests
CREATE TABLE IF NOT EXISTS buddy_requests (
  request_id VARCHAR(64) PRIMARY KEY,
  sender_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  receiver_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  note VARCHAR(200),
  status VARCHAR(32) DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
  needs_mentor_review INT DEFAULT 0,
  flag_reason VARCHAR(255) DEFAULT 'Cross-year / academic gap',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_buddy_requests_receiver_status ON buddy_requests(receiver_id, status);

-- 10. Mentor Reviews
CREATE TABLE IF NOT EXISTS mentor_reviews (
  review_id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL REFERENCES buddy_requests(request_id),
  mentor_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  decision VARCHAR(32) NOT NULL CHECK(decision IN ('approved', 'rejected')),
  remarks TEXT,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Connections
CREATE TABLE IF NOT EXISTS connections (
  connection_id VARCHAR(64) PRIMARY KEY,
  user_a VARCHAR(64) NOT NULL REFERENCES users(user_id),
  user_b VARCHAR(64) NOT NULL REFERENCES users(user_id),
  status VARCHAR(32) DEFAULT 'active' CHECK(status IN ('active', 'ended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  CONSTRAINT chk_no_self_connection CHECK (user_a != user_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_ordered_pair 
ON connections (LEAST(user_a, user_b), GREATEST(user_a, user_b)) 
WHERE status = 'active';

-- 12. Messages
CREATE TABLE IF NOT EXISTS messages (
  message_id VARCHAR(64) PRIMARY KEY,
  connection_id VARCHAR(64) NOT NULL REFERENCES connections(connection_id),
  sender_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  body TEXT,
  attachment_url TEXT,
  attachment_name VARCHAR(255),
  attachment_type VARCHAR(128),
  status VARCHAR(32) DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read')),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_connection_sent_at ON messages(connection_id, sent_at);

-- 13. Study Sessions & Attendance
CREATE TABLE IF NOT EXISTS study_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  connection_id VARCHAR(64) REFERENCES connections(connection_id),
  organizer_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  partner_id VARCHAR(64) REFERENCES users(user_id),
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  mode VARCHAR(32) NOT NULL CHECK(mode IN ('online', 'on_campus')),
  location_or_link TEXT NOT NULL,
  status VARCHAR(32) DEFAULT 'proposed' CHECK(status IN ('proposed', 'confirmed', 'declined', 'completed', 'cancelled')),
  department VARCHAR(255),
  semester INT DEFAULT 1,
  confirmed_by_organizer INT DEFAULT 0,
  confirmed_by_partner INT DEFAULT 0,
  is_verified INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_attendance (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES study_sessions(session_id),
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  attended VARCHAR(16) NOT NULL CHECK(attended IN ('yes', 'no')),
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, user_id)
);

-- 14. Reviews & Ratings
CREATE TABLE IF NOT EXISTS reviews (
  review_id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES study_sessions(session_id),
  reviewer_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  reviewee_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  punctuality INT NOT NULL CHECK(punctuality BETWEEN 1 AND 5),
  helpfulness INT NOT NULL CHECK(helpfulness BETWEEN 1 AND 5),
  communication INT NOT NULL CHECK(communication BETWEEN 1 AND 5),
  comment VARCHAR(300),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(session_id, reviewer_id)
);

-- 15. Learning Resources
CREATE TABLE IF NOT EXISTS resources (
  resource_id VARCHAR(64) PRIMARY KEY,
  mentor_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  semester INT DEFAULT 1,
  file_url_or_link TEXT NOT NULL,
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  notification_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  type VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255),
  is_read INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON notifications(user_id, is_read);

-- 17. Reports & Moderation
CREATE TABLE IF NOT EXISTS reports (
  report_id VARCHAR(64) PRIMARY KEY,
  reporter_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  reported_user_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  message_id VARCHAR(64),
  reason VARCHAR(64) NOT NULL CHECK(reason IN ('harassment', 'spam', 'fake_profile', 'inappropriate_content', 'other')),
  description TEXT,
  chat_excerpt TEXT,
  status VARCHAR(32) DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under review', 'Action taken', 'Closed')),
  handled_by VARCHAR(64),
  action_taken TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

-- 18. Audit Log & Settings
CREATE TABLE IF NOT EXISTS audit_log (
  log_id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  target VARCHAR(255),
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL
);

-- 19. Password Resets (Stores SHA-256 hashed single-use tokens)
CREATE TABLE IF NOT EXISTS password_resets (
  token VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON password_resets(email);

-- 20. Email Verifications (Stores SHA-256 hashed single-use tokens)
CREATE TABLE IF NOT EXISTS email_verifications (
  token VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);

-- 21. Guidance Messages from Mentors
CREATE TABLE IF NOT EXISTS guidance_messages (
  guidance_id VARCHAR(64) PRIMARY KEY,
  mentor_id VARCHAR(64) NOT NULL REFERENCES users(user_id),
  subject VARCHAR(255),
  target_type VARCHAR(32) NOT NULL CHECK(target_type IN ('student', 'subject', 'all')),
  target_id VARCHAR(64),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


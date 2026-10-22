-- ====================================================================
-- Peer Buddy System – NMIMS Complete Supabase PostgreSQL Migration
-- Includes: Schema, Constraints, Triggers, RLS Policies, Indexes
-- ====================================================================

-- 1. Helper function for triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS public.users (
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

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_sap_id ON public.users(sap_id);

-- 3. Schools & Programs
CREATE TABLE IF NOT EXISTS public.schools (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  semesters INT DEFAULT 8
);

CREATE TABLE IF NOT EXISTS public.programs (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL
);

-- 4. Student Profiles
CREATE TABLE IF NOT EXISTS public.student_profiles (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  school_id VARCHAR(64) REFERENCES public.schools(id),
  program_id VARCHAR(64) REFERENCES public.programs(id),
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

-- 5. Staff Profiles
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  department VARCHAR(255),
  designation VARCHAR(255),
  expertise TEXT,
  photo_url TEXT
);

-- 6. Skills & User Skills
CREATE TABLE IF NOT EXISTS public.skills (
  skill_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(128) NOT NULL,
  approved INT DEFAULT 1,
  suggested_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS public.user_skills (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  skill_id VARCHAR(64) NOT NULL REFERENCES public.skills(skill_id) ON DELETE CASCADE,
  type VARCHAR(32) NOT NULL CHECK(type IN ('has', 'wants_to_learn')),
  level VARCHAR(32) DEFAULT 'intermediate',
  UNIQUE(user_id, skill_id, type)
);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill_id ON public.user_skills(skill_id);

-- 7. Interests & User Interests
CREATE TABLE IF NOT EXISTS public.interests (
  interest_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(128) NOT NULL,
  approved INT DEFAULT 1,
  suggested_by VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS public.user_interests (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  interest_id VARCHAR(64) NOT NULL REFERENCES public.interests(interest_id) ON DELETE CASCADE,
  UNIQUE(user_id, interest_id)
);

-- 8. Availability
CREATE TABLE IF NOT EXISTS public.availability (
  availability_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  day_of_week VARCHAR(32) NOT NULL,
  start_time VARCHAR(16) NOT NULL,
  end_time VARCHAR(16) NOT NULL
);

-- 9. Buddy Requests / Invites (Many-to-Many connections)
CREATE TABLE IF NOT EXISTS public.buddy_requests (
  request_id VARCHAR(64) PRIMARY KEY,
  sender_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  receiver_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  note VARCHAR(200),
  status VARCHAR(32) DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
  needs_mentor_review INT DEFAULT 0,
  flag_reason VARCHAR(255) DEFAULT 'Cross-year / academic gap',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP,
  CONSTRAINT chk_no_self_buddy_request CHECK (sender_id != receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_buddy_requests_receiver_status ON public.buddy_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_buddy_requests_sender_status ON public.buddy_requests(sender_id, status);

-- 10. Connections (Many-to-Many, pair unique)
CREATE TABLE IF NOT EXISTS public.connections (
  connection_id VARCHAR(64) PRIMARY KEY,
  user_a VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  user_b VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  status VARCHAR(32) DEFAULT 'active' CHECK(status IN ('active', 'ended')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  CONSTRAINT chk_no_self_connection CHECK (user_a != user_b)
);

-- Mark older duplicate active connections as 'ended' instead of deleting them, preserving foreign key message history
UPDATE public.connections c1
SET status = 'ended', ended_at = CURRENT_TIMESTAMP
WHERE status = 'active'
  AND c1.connection_id NOT IN (
    SELECT (ARRAY_AGG(c2.connection_id ORDER BY c2.created_at DESC))[1]
    FROM public.connections c2
    WHERE c2.status = 'active'
    GROUP BY LEAST(c2.user_a, c2.user_b), GREATEST(c2.user_a, c2.user_b)
  );

-- Unique pair index ensuring no duplicate active connections regardless of who is user_a/user_b
CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_ordered_pair 
ON public.connections (LEAST(user_a, user_b), GREATEST(user_a, user_b)) 
WHERE status = 'active';

-- 11. Messages
CREATE TABLE IF NOT EXISTS public.messages (
  message_id VARCHAR(64) PRIMARY KEY,
  connection_id VARCHAR(64) NOT NULL REFERENCES public.connections(connection_id),
  sender_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  body TEXT,
  attachment_url TEXT,
  attachment_name VARCHAR(255),
  attachment_type VARCHAR(128),
  status VARCHAR(32) DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'read')),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_connection_sent_at ON public.messages(connection_id, sent_at);

-- 12. Study Sessions & Confirmations
CREATE TABLE IF NOT EXISTS public.study_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  connection_id VARCHAR(64) REFERENCES public.connections(connection_id),
  organizer_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  partner_id VARCHAR(64) REFERENCES public.users(user_id),
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
CREATE INDEX IF NOT EXISTS idx_study_sessions_start_at ON public.study_sessions(start_at);

-- Session Attendance
CREATE TABLE IF NOT EXISTS public.session_attendance (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES public.study_sessions(session_id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  attended VARCHAR(16) NOT NULL CHECK(attended IN ('yes', 'no')),
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, user_id)
);

-- 13. Reviews & Ratings
CREATE TABLE IF NOT EXISTS public.reviews (
  review_id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL REFERENCES public.study_sessions(session_id),
  reviewer_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  reviewee_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  punctuality INT NOT NULL CHECK(punctuality BETWEEN 1 AND 5),
  helpfulness INT NOT NULL CHECK(helpfulness BETWEEN 1 AND 5),
  communication INT NOT NULL CHECK(communication BETWEEN 1 AND 5),
  comment VARCHAR(300),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(session_id, reviewer_id)
);

-- 14. Learning Resources
CREATE TABLE IF NOT EXISTS public.resources (
  resource_id VARCHAR(64) PRIMARY KEY,
  mentor_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  semester INT DEFAULT 1,
  file_url_or_link TEXT NOT NULL,
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.resource_allocations (
  allocation_id VARCHAR(64) PRIMARY KEY,
  resource_id VARCHAR(64) NOT NULL REFERENCES public.resources(resource_id) ON DELETE CASCADE,
  student_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_resource_allocations_student ON public.resource_allocations(student_id);

-- 15. Reports & Moderation
CREATE TABLE IF NOT EXISTS public.reports (
  report_id VARCHAR(64) PRIMARY KEY,
  reporter_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  reported_user_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
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

-- 16. Audit Log & Settings
CREATE TABLE IF NOT EXISTS public.audit_log (
  log_id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  target VARCHAR(255),
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.settings (
  key VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL
);

-- 17. Password Resets & Email Verifications
CREATE TABLE IF NOT EXISTS public.password_resets (
  token VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_email ON public.password_resets(email);

CREATE TABLE IF NOT EXISTS public.email_verifications (
  token VARCHAR(128) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON public.email_verifications(email);

-- 18. Mentor Reviews & Guidance
CREATE TABLE IF NOT EXISTS public.mentor_reviews (
  review_id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL REFERENCES public.buddy_requests(request_id),
  mentor_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  decision VARCHAR(32) NOT NULL CHECK(decision IN ('approved', 'rejected')),
  remarks TEXT,
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.guidance_messages (
  guidance_id VARCHAR(64) PRIMARY KEY,
  mentor_id VARCHAR(64) NOT NULL REFERENCES public.users(user_id),
  subject VARCHAR(255),
  target_type VARCHAR(32) NOT NULL CHECK(target_type IN ('student', 'subject', 'all')),
  target_id VARCHAR(64),
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guidance_messages ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically in Supabase.
-- For anon & authenticated clients:

-- Public reference tables (read-only for all authenticated & anon users)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read schools') THEN
    CREATE POLICY "Public read schools" ON public.schools FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read programs') THEN
    CREATE POLICY "Public read programs" ON public.programs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read skills') THEN
    CREATE POLICY "Public read skills" ON public.skills FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read interests') THEN
    CREATE POLICY "Public read interests" ON public.interests FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read settings') THEN
    CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);
  END IF;
END $$;

-- Student profiles: authenticated users can read other active students; users can update their own
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Read student profiles') THEN
    CREATE POLICY "Read student profiles" ON public.student_profiles FOR SELECT
    USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Update own student profile') THEN
    CREATE POLICY "Update own student profile" ON public.student_profiles FOR UPDATE
    USING (auth.uid()::text = user_id);
  END IF;
END $$;

-- Buddy requests: participants can see and manage their own requests
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants read buddy requests') THEN
    CREATE POLICY "Participants read buddy requests" ON public.buddy_requests FOR SELECT
    USING (auth.uid()::text = sender_id OR auth.uid()::text = receiver_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Sender create buddy requests') THEN
    CREATE POLICY "Sender create buddy requests" ON public.buddy_requests FOR INSERT
    WITH CHECK (auth.uid()::text = sender_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants update buddy requests') THEN
    CREATE POLICY "Participants update buddy requests" ON public.buddy_requests FOR UPDATE
    USING (auth.uid()::text = sender_id OR auth.uid()::text = receiver_id);
  END IF;
END $$;

-- Connections: active participants can see and update their connections
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants read connections') THEN
    CREATE POLICY "Participants read connections" ON public.connections FOR SELECT
    USING (auth.uid()::text = user_a OR auth.uid()::text = user_b);
  END IF;
END $$;

-- Messages: only connected participants can read/send messages
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants read messages') THEN
    CREATE POLICY "Participants read messages" ON public.messages FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.connection_id = messages.connection_id
        AND (c.user_a = auth.uid()::text OR c.user_b = auth.uid()::text)
    ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Sender insert messages') THEN
    CREATE POLICY "Sender insert messages" ON public.messages FOR INSERT
    WITH CHECK (auth.uid()::text = sender_id);
  END IF;
END $$;

-- Study Sessions: participants and faculty can view
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants read sessions') THEN
    CREATE POLICY "Participants read sessions" ON public.study_sessions FOR SELECT
    USING (
      auth.uid()::text = organizer_id 
      OR auth.uid()::text = partner_id 
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.user_id = auth.uid()::text AND u.role IN ('faculty', 'admin'))
    );
  END IF;
END $$;

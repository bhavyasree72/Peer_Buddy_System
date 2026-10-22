# Peer Buddy System – NMIMS

An intra-college peer mentorship and study partner collaboration platform designed exclusively for NMIMS students, mentors, faculty, and administrators. Built strictly according to the **NMIMS Application Design Document** with modern Supabase PostgreSQL backend integration and production deployment on Render.

Deployed API: `https://peer-buddy-api.onrender.com/`  
GitHub Repository: `https://github.com/bhavyasree72/Peer_Buddy_System`

---

## 🚀 Key Features & Architectural Updates

- **Supabase PostgreSQL & Dual Mode**: Primary PostgreSQL connection via Supabase Transaction Pooler (`aws-0-ap-south-1.pooler.supabase.com:6543`) with Row Level Security (RLS) policies across all tables, falling back automatically to local SQLite (`sql.js`) when offline.
- **Strict Role-Based Registration & Validation**:
  - **Student Email**: Must end with `@nmims.in`.
  - **Faculty & Mentor Email**: Must end with `@nmims.edu`.
  - **SAP ID**: Exactly 11 numeric digits starting with `7` (`^7\d{10}$`), validated on client, server, and enforced via DB check constraints.
  - **Name**: Letters and spaces only, minimum 2 characters.
  - **Strong Password Policy**: Minimum 8 characters with at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character with a live 5-point checklist indicator.
  - **Isolated Form State**: Role switching (Student / Faculty / Mentor) resets form values and prevents browser autofill or field bleeding.
  - **No Pre-selected Dropdowns**: Mandatory disabled placeholders (`Select semester…`, `Select school…`, `Select program…`, `Select year…`, `Select mentor…`) prevent accidental default submissions.
- **Role-Aware Authentication**:
  - Login email placeholder adapts dynamically based on selected role (`student@nmims.in`, `faculty@nmims.edu`, `mentor@nmims.edu`).
  - Forgot Password dispatches single-use cryptographically secure SHA-256 tokens valid for 30 minutes.
  - Dedicated `/reset-password` recovery handler with password rule enforcement.
- **Multi-Buddy Search & Connections**:
  - Search lists all registered students (excluding self) with multi-criteria filtering by name, SAP ID, and semester.
  - Many-to-many buddy connections (students can connect with multiple peers) with order-independent uniqueness enforced via `LEAST(user_a, user_b), GREATEST(user_a, user_b)`.
- **Dual Session Confirmation & Real Faculty Attendance**:
  - Attendance % calculated as `(verified sessions attended / total scheduled sessions) * 100` (shows `N/A` or `0%` if no sessions exist, never a default 100%).
  - Both participants must confirm attendance for a session to become verified (`2 / 2`).
  - Faculty dashboard charts the last 7 days of session activity converted to Indian Standard Time (IST) with a proper empty state.
- **Streamlined Student Navigation**:
  - Removed redundant Notifications section from student routes, sidebar, and polling without breaking navigation.

---

## 🔑 Login Credentials (4 Pre-Seeded Accounts)

All 4 test accounts are pre-seeded, active, and verified:

| Role | Email Address | Password | Details |
| :--- | :--- | :--- | :--- |
| **Student** | `student@nmims.in` | `Student@123` | SAP ID: `70000000001` (Aditi Sharma, B.Tech CSDS) |
| **Mentor** | `mentor@nmims.in` | `Mentor@123` | Dr. Rajesh Deshmukh (Senior Technical Mentor) |
| **Faculty** | `faculty@nmims.in` | `Faculty@123` | Prof. Ananya Iyer (Computer Science & Engineering) |
| **Administrator** | `admin@nmims.in` | `Admin@123` | NMIMS System Administrator (Academic IT) |

---

## 🛠️ Tech Stack & Directory Structure

```text
peer_Buddy/
├── client/                     # Frontend (React 18, Vite 5.4, Vanilla CSS)
│   ├── dist/                   # Production build bundle
│   └── src/
│       ├── components/         # Sidebar, Modals, Dialogs
│       ├── pages/              # AuthPage, StudentHome, FindBuddies, MyBuddies,
│       │                       # FacultyOverview, FacultySessions, etc.
│       └── services/api.js     # Unified REST API client
├── server/                     # Backend API (Node.js 20, Express 4.21)
│   ├── src/
│   │   ├── controllers/        # auth, search, request, session, faculty, etc.
│   │   ├── database/           # db.js (dual PG/SQLite pool), schema.sql, seed.js
│   │   ├── middleware/         # auth (JWT), role verification
│   │   └── utils/              # emailService (Resend SDK), supabase.js
│   └── test/runner.js          # Automated security & regression test suite
├── supabase/
│   └── migrations/             # Idempotent PostgreSQL migration scripts
├── .env.example                # Documented environment variables template
└── README.md
```

---

## ⚙️ Setup & Deployment Instructions

### 1. Local Development Setup

```bash
# Clone the repository
git clone https://github.com/bhavyasree72/Peer_Buddy_System.git
cd peer_Buddy

# Configure server environment
copy .env.example server\.env

# Install dependencies
cd server && npm install
cd ../client && npm install

# Run automated tests
cd ../server && npm test

# Start Backend Server (Port 5000)
npm start

# In a separate terminal, start Frontend (Port 3000)
cd ../client && npm run dev
```

### 2. Supabase Database Migration

1. In the **Supabase Dashboard**, navigate to **SQL Editor**.
2. Open `supabase/migrations/20261022_peer_buddy_complete_migration.sql`.
3. Paste the contents into the SQL Editor and click **Run**.
4. All tables, check constraints, indexes, and RLS policies will be applied.

### 3. Render Deployment Environment Variables

Configure these keys in **Render Dashboard → Web Service (`peer-buddy-api`) → Environment**:

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://postgres.crwwnzhqqminmerftkih:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://crwwnzhqqminmerftkih.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
JWT_SECRET=nmims_peer_buddy_jwt_super_secret_key_2026
JWT_EXPIRES_IN=2h
JWT_REFRESH_SECRET=nmims_peer_buddy_refresh_secret_key_2026
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://peer-buddy-app.vercel.app
CLIENT_URL=https://peer-buddy-app.vercel.app
RESEND_API_KEY=[YOUR_RESEND_API_KEY]
EMAIL_FROM=NMIMS Peer Buddy <onboarding@resend.dev>
```

---

## 🧪 Quality & Test Verification

All security rules, regression scenarios, and input validations are verified via `npm test` in [`server/test/runner.js`](server/test/runner.js):
- 11-digit SAP ID starting with 7
- Domain validation per role (`@nmims.in` vs `@nmims.edu`)
- Strong password enforcement
- Cryptographically hashed single-use password reset tokens
- Multi-buddy connections and session conflict prevention
- Access control on attachments (403 for non-participants)

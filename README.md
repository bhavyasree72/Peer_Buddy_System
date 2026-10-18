# Peer Buddy System – NMIMS

An intra-college peer mentorship and study partner collaboration platform designed exclusively for NMIMS students, mentors, faculty, and administrators. Built strictly according to the **NMIMS Application Design Document** (Version 1.0).

---

## 🚀 Quick Setup & Installation

### Prerequisites
- Node.js (v18+ or v20+)
- npm (v9+)
- PostgreSQL (Optional: if not configured, the system uses the embedded database file automatically).

### 1. Clone & Enter Directory
```bash
git clone <repo-url>
cd peer_Buddy
```

### 2. Configure Environment Variables
Copy `.env.example` to `server/.env`:
```bash
# Windows PowerShell
Copy-Item .env.example server/.env

# Linux / macOS
cp .env.example server/.env
```

### 3. Install Backend & Frontend Dependencies
```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
cd ..
```

### 4. Database Migration & Seeding
Run the idempotent seed script to initialize master data (NMIMS schools, programs, semesters, approved skills, interests) and create the 4 required test accounts:
```bash
cd server
npm run seed
```
*(You can re-run `npm run seed` safely at any time).*

### 5. Run the Automated Acceptance Test Suite
Verify that all 17 user stories and system business rules pass:
```bash
npm test
```

### 6. Start the Application

#### Terminal 1: Backend Server (Port 5000)
```bash
cd server
npm start
```

#### Terminal 2: Frontend Development Server (Port 3000)
```bash
cd client
npm run dev
```

Open your browser at `http://localhost:3000`.

---

## 🔑 Login Credentials (4 Required Test Accounts)

All 4 test accounts are pre-seeded, email-verified, and active. Passwords are securely hashed with `bcrypt`:

| Role | Email Address | Password | Details |
| :--- | :--- | :--- | :--- |
| **Student** | `student@nmims.in` | `Student@123` | SAP ID: `70000000001` (Aditi Sharma, B.Tech CSDS) |
| **Mentor** | `mentor@nmims.in` | `Mentor@123` | Dr. Rajesh Deshmukh (Senior Technical Mentor) |
| **Faculty** | `faculty@nmims.in` | `Faculty@123` | Prof. Ananya Iyer (Computer Science & Engineering) |
| **Administrator** | `admin@nmims.in` | `Admin@123` | NMIMS System Administrator (Academic IT) |

---

## 🎨 Design System & Aesthetics (Doc Section 7.1)
- **Base:** Pure White (`#FFFFFF`) / Subtle Background (`#FAFAFA`)
- **Single Accent:** Light Red `#E4574C`
- **Accent Hover:** `#CC4137`
- **Faint Tint / Badges:** `#FFF3F1`
- **Borders:** Thin `#E5E5E5`
- **Text:** High-contrast `#222222` with muted secondary text `#666666`
- **Typography:** Inter, clean 8px grid, 16px card padding, 12px border radius, 44px tap targets.
- **Honest Empty States:** Real contextual messages (e.g. *"Say hello to start the conversation."*, *"No buddy requests yet. Try searching for someone who shares your subjects."*).
- **Responsive Navigation:** Clean sidebar on desktop and bottom navigation bar on mobile.

---

## 🧩 Architectural Modules

1. **Authentication (US1, US2, US12):** NMIMS-only email validation, 5-attempt rate-limiting with 15-minute lockout, JWT access & refresh tokens, password reset flow.
2. **Profile Management (US3):** Bio (250 chars max), skills picker, interests, weekly availability grid, privacy toggles, profile completeness meter.
3. **Buddy Search & Weighted Matching (US4, FR4, FR5):** Multi-factor scoring (shared skills 40, complementary needs 25, availability 20, school/sem 10, rating 5).
4. **Buddy Requests (US5, US6, US14):** 200-char note, max 10 pending outgoing requests, duplicate prevention, mentor review flagging.
5. **Real-Time Chat (US7, FR8):** Socket.IO delivery, file attachments (PDF, DOCX, PNG, JPG ≤ 5MB), typing indicators, presence, report message context.
6. **Study Sessions & Calendar (US8, US13, FR9):** Scheduling, conflict detection, list & calendar view, post-session attendance.
7. **Feedback & Rating (US9, FR13):** 3-point 1–5 stars (punctuality, helpfulness, communication) + 300-char review editable within 48h.
8. **Mentor Portal (US14, US15):** Flagged request approval queue, learning resource sharing, broadcast guidance.
9. **Faculty Portal (US12, US13, FR15):** Department participation metrics, session monitoring (with private chat content strictly protected).
10. **Administrator Portal (US11, FR16):** Full user management, CSV bulk import, moderation queue with chat excerpt inspection, match weight sliders, and audit logs.

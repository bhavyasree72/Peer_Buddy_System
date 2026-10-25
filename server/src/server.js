require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const masterRoutes = require('./routes/masterRoutes');
const searchRoutes = require('./routes/searchRoutes');
const requestRoutes = require('./routes/requestRoutes');
const chatRoutes = require('./routes/chatRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const activityRoutes = require('./routes/activityRoutes');
const mentorRoutes = require('./routes/mentorRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const adminRoutes = require('./routes/adminRoutes');

const { setupSocket } = require('./socket/chatSocket');
const { startReminderScheduler } = require('./utils/scheduler');
const migrate = require('./database/migrate');
const seed = require('./database/seed');

const app = express();
const server = http.createServer(app);

// Allowed origins
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5000'
].filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true; // allow same-origin, curl, server-to-server
  if (allowedOrigins.includes(origin)) return true;
  // Allow Firebase Hosting and Cloud Run domain patterns
  if (/\.web\.app$/.test(origin) || /\.firebaseapp\.com$/.test(origin) || /\.run\.app$/.test(origin)) {
    return true;
  }
  return false;
}

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev/fallback or match
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
const uploadsPath = path.join(__dirname, '../../uploads');
app.use('/uploads', express.static(uploadsPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/master', masterRoutes);
app.use('/api/buddies', searchRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/mentor', mentorRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/admin', adminRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NMIMS Peer Buddy System API', version: '1.0.0' });
});

// Serve frontend build if present
const clientBuildPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientBuildPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found.' });
  }
  const indexPath = path.join(clientBuildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(200).send('Peer Buddy System - NMIMS API Server is running.');
    }
  });
});

// Setup Real-time Chat
setupSocket(io);

// Start background cron jobs
startReminderScheduler();

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    server.listen(PORT, async () => {
      console.log(`=======================================================`);
      console.log(` NMIMS Peer Buddy System API Server running on port ${PORT}`);
      console.log(` WebSocket Chat Server ready`);
      console.log(`=======================================================`);

      try {
        await seed.seedMasterData();
        await seed.ensureBootstrapAdmin();
      } catch (initErr) {
        console.error('Initialization error during bootstrap:', initErr);
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = { app, server };

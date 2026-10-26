const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const {
  COLLECTIONS,
  setDoc,
  getAllDocs,
  nowISO
} = require('../database/firestoreDb');

function startReminderScheduler() {
  console.log('[Scheduler] Starting node-cron session reminder scheduler...');

  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).getTime();
      const in24hPlus10m = new Date(now.getTime() + (24 * 60 + 10) * 60 * 1000).getTime();

      const in1h = new Date(now.getTime() + 60 * 60 * 1000).getTime();
      const in1hPlus10m = new Date(now.getTime() + 70 * 60 * 1000).getTime();

      const allSessions = await getAllDocs(COLLECTIONS.STUDY_SESSIONS);
      const confirmedSessions = allSessions.filter(s => s.status === 'confirmed' && s.start_at);

      // 1. Sessions in ~24 hours
      const s24 = confirmedSessions.filter(s => {
        const t = new Date(s.start_at).getTime();
        return t >= in24h && t < in24hPlus10m;
      });

      for (const s of s24) {
        for (const uid of [s.organizer_id, s.partner_id].filter(Boolean)) {
          const id = uuidv4();
          await setDoc(COLLECTIONS.NOTIFICATIONS, id, {
            notification_id: id,
            user_id: uid,
            type: 'session_reminder_24h',
            message: `Reminder: Study session "${s.title}" starts tomorrow at ${new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
            link: '/sessions',
            is_read: 0,
            created_at: nowISO()
          });
        }
      }

      // 2. Sessions in ~1 hour
      const s1 = confirmedSessions.filter(s => {
        const t = new Date(s.start_at).getTime();
        return t >= in1h && t < in1hPlus10m;
      });

      for (const s of s1) {
        for (const uid of [s.organizer_id, s.partner_id].filter(Boolean)) {
          const id = uuidv4();
          await setDoc(COLLECTIONS.NOTIFICATIONS, id, {
            notification_id: id,
            user_id: uid,
            type: 'session_reminder_1h',
            message: `Upcoming: Study session "${s.title}" begins in 1 hour!`,
            link: '/sessions',
            is_read: 0,
            created_at: nowISO()
          });
        }
      }
    } catch (err) {
      console.error('[Scheduler] Reminder check error:', err);
    }
  });
}

module.exports = {
  startReminderScheduler
};

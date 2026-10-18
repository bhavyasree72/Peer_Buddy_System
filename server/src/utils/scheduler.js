const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');

function startReminderScheduler() {
  console.log('Starting node-cron session reminder scheduler...');

  // Check every 10 minutes for upcoming sessions needing 24-hour or 1-hour reminders
  cron.schedule('*/10 * * * *', async () => {
    try {
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const in24hPlus10m = new Date(now.getTime() + (24 * 60 + 10) * 60 * 1000).toISOString();

      const in1h = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      const in1hPlus10m = new Date(now.getTime() + 70 * 60 * 1000).toISOString();

      // 1. Sessions in ~24 hours
      const s24 = (await query(`
        SELECT session_id, organizer_id, partner_id, title, start_at
        FROM study_sessions
        WHERE status = 'confirmed' AND start_at >= ? AND start_at < ?
      `, [in24h, in24hPlus10m])).rows;

      for (const s of s24) {
        for (const uid of [s.organizer_id, s.partner_id]) {
          await query(`
            INSERT INTO notifications (notification_id, user_id, type, message, link)
            VALUES (?, ?, 'session_reminder_24h', ?, '/sessions')
          `, [uuidv4(), uid, `Reminder: Study session "${s.title}" starts tomorrow at ${new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`]);
        }
      }

      // 2. Sessions in ~1 hour
      const s1 = (await query(`
        SELECT session_id, organizer_id, partner_id, title, start_at
        FROM study_sessions
        WHERE status = 'confirmed' AND start_at >= ? AND start_at < ?
      `, [in1h, in1hPlus10m])).rows;

      for (const s of s1) {
        for (const uid of [s.organizer_id, s.partner_id]) {
          await query(`
            INSERT INTO notifications (notification_id, user_id, type, message, link)
            VALUES (?, ?, 'session_reminder_1h', ?, '/sessions')
          `, [uuidv4(), uid, `Upcoming: Study session "${s.title}" begins in 1 hour!`]);
        }
      }
    } catch (err) {
      console.error('Reminder scheduler check error:', err);
    }
  });
}

module.exports = {
  startReminderScheduler
};

const { query } = require('../database/db');

// GET /api/notifications
async function getNotifications(req, res) {
  try {
    const userId = req.user.userId;

    const notifs = (await query(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId])).rows;

    const unreadCount = notifs.filter(n => !n.is_read).length;

    // Group by Today vs Earlier (as specified in doc Screen 12)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const today = [];
    const earlier = [];

    notifs.forEach(n => {
      const d = new Date(n.created_at);
      if (d >= startOfToday) {
        today.push(n);
      } else {
        earlier.push(n);
      }
    });

    return res.json({
      notifications: notifs,
      grouped: {
        today,
        earlier
      },
      unreadCount
    });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
}

// POST /api/notifications/mark-read
async function markRead(req, res) {
  try {
    const userId = req.user.userId;
    const { notificationId } = req.body;

    if (notificationId) {
      await query('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?', [
        notificationId,
        userId
      ]);
    } else {
      // Mark all as read
      await query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    }

    return res.json({ message: 'Notifications updated.' });
  } catch (err) {
    console.error('markRead error:', err);
    return res.status(500).json({ error: 'Failed to mark notifications.' });
  }
}

module.exports = {
  getNotifications,
  markRead
};

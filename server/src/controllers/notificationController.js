const {
  COLLECTIONS,
  queryDocs,
  updateDoc,
  getBatch
} = require('../database/firestoreDb');

// GET /api/notifications
async function getNotifications(req, res) {
  try {
    const userId = req.user.userId;

    const notifs = await queryDocs(COLLECTIONS.NOTIFICATIONS, [['user_id', '==', userId]]);
    notifs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const unreadCount = notifs.filter(n => !n.is_read || n.is_read === 0).length;

    // Group by Today vs Earlier
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
      await updateDoc(COLLECTIONS.NOTIFICATIONS, notificationId, { is_read: 1 });
    } else {
      // Mark all as read for user
      const unread = await queryDocs(COLLECTIONS.NOTIFICATIONS, [
        ['user_id', '==', userId]
      ]);
      const toUpdate = unread.filter(n => !n.is_read || n.is_read === 0);
      if (toUpdate.length > 0) {
        const batch = getBatch();
        const { collection } = require('../database/firestoreDb');
        toUpdate.forEach(n => {
          const docId = n.notification_id || n.id;
          batch.update(collection(COLLECTIONS.NOTIFICATIONS).doc(docId), { is_read: 1 });
        });
        await batch.commit();
      }
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

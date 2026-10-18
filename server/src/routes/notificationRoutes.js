const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, notificationController.getNotifications);
router.post('/mark-read', verifyToken, notificationController.markRead);

module.exports = router;

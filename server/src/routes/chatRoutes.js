const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/conversations', verifyToken, chatController.getConversations);
router.get('/messages/:connectionId', verifyToken, chatController.getMessages);
router.post('/send', verifyToken, upload.single('attachment'), chatController.sendMessage);
router.get('/attachments/:messageId', verifyToken, chatController.downloadAttachment);

module.exports = router;

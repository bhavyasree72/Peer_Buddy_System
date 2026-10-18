const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, sessionController.getSessions);
router.post('/propose', verifyToken, sessionController.proposeSession);
router.post('/:sessionId/respond', verifyToken, sessionController.respondSession);
router.post('/:sessionId/attendance', verifyToken, sessionController.markAttendance);

module.exports = router;

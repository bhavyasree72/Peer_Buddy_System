const express = require('express');
const router = express.Router();
const mentorController = require('../controllers/mentorController');
const { verifyToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// General resource view for students and staff
router.get('/resources', verifyToken, mentorController.getResources);

// Mentor-specific actions
router.get('/dashboard', verifyToken, requireRole('mentor', 'admin'), mentorController.getMentorDashboard);
router.get('/review-requests', verifyToken, requireRole('mentor', 'admin'), mentorController.getReviewRequests);
router.get('/my-students', verifyToken, requireRole('mentor', 'admin'), mentorController.getMyStudents);
router.get('/messages', verifyToken, requireRole('mentor', 'admin'), mentorController.getMentorMessages);
router.post('/reviews/:requestId', verifyToken, requireRole('mentor', 'admin'), mentorController.reviewBuddyRequest);
router.post('/resources/upload', verifyToken, requireRole('mentor', 'admin', 'faculty'), upload.single('file'), mentorController.uploadResource);
router.post('/guidance', verifyToken, requireRole('mentor', 'admin'), mentorController.sendGuidanceMessage);

module.exports = router;

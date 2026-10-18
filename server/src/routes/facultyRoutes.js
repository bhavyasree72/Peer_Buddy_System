const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/facultyController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/overview', verifyToken, requireRole('faculty', 'admin'), facultyController.getFacultyOverview);
router.get('/sessions', verifyToken, requireRole('faculty', 'admin'), facultyController.getFacultySessions);
router.get('/students', verifyToken, requireRole('faculty', 'admin'), facultyController.getFacultyStudents);
router.get('/reports', verifyToken, requireRole('faculty', 'admin'), facultyController.getFacultyReports);

module.exports = router;

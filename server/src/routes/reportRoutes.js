const express = require('express');
const router = express.Router();
const reviewReportController = require('../controllers/reviewReportController');
const { verifyToken } = require('../middleware/auth');

router.post('/create', verifyToken, reviewReportController.createReport);
router.get('/my', verifyToken, reviewReportController.getMyReports);

module.exports = router;

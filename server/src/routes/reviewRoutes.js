const express = require('express');
const router = express.Router();
const reviewReportController = require('../controllers/reviewReportController');
const { verifyToken } = require('../middleware/auth');

router.post('/submit', verifyToken, reviewReportController.submitReview);

module.exports = router;

const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { verifyToken } = require('../middleware/auth');

router.get('/history', verifyToken, activityController.getActivityHistory);

module.exports = router;

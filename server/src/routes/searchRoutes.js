const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const { verifyToken } = require('../middleware/auth');

router.get('/search', verifyToken, searchController.searchBuddies);
router.get('/suggested', verifyToken, searchController.getSuggestedBuddies);

module.exports = router;

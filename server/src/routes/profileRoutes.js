const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { verifyToken } = require('../middleware/auth');

router.get('/me', verifyToken, (req, res) => profileController.getProfile(req, res));
router.get('/:userId', verifyToken, profileController.getProfile);
router.put('/', verifyToken, profileController.updateProfile);
router.post('/suggest-skill', verifyToken, profileController.suggestSkill);

module.exports = router;

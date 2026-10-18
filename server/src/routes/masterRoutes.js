const express = require('express');
const router = express.Router();
const masterController = require('../controllers/masterController');

router.get('/all', masterController.getMasterData);

module.exports = router;

const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { verifyToken } = require('../middleware/auth');

router.post('/send', verifyToken, requestController.sendRequest);
router.post('/:requestId/respond', verifyToken, requestController.respondToRequest);
router.post('/:requestId/cancel', verifyToken, requestController.cancelRequest);
router.get('/', verifyToken, requestController.getRequests);
router.post('/disconnect/:connectionId', verifyToken, requestController.disconnectBuddy);

module.exports = router;

const express = require('express');
const { initiateCall } = require('../controllers/socketController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply the JWT protection middleware to all socket routes (you must be logged in to call)
router.use(protect);

// POST /api/v1/realtime/call/:recipientId - Initiates a call
router.route('/call/:recipientId')
    .post(initiateCall);

module.exports = router;

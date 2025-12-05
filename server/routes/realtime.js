const express = require('express');
const { initiateCall } = require('../controllers/realtime');

const router = express.Router();

// POST /api/v1/realtime/call/:recipientId
// This route is called by the client to begin the call process 
// by sending the initial SDP Offer to the server.
router.route('/call/:recipientId').post(initiateCall);

module.exports = router;

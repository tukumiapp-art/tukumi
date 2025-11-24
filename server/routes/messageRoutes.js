const express = require('express');
const { getMessages, sendMessage } = require('../controllers/MessageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All message routes must be protected
router.use(protect); 

// Route to get a specific conversation history or start a new one
// GET /api/v1/messages/:recipientId
router.route('/:recipientId')
    .get(getMessages)
    .post(sendMessage); // Use POST to send a new message to the recipient

module.exports = router;

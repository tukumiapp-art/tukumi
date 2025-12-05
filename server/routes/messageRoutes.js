const express = require('express');
const { getMessages, sendMessage } = require('../controllers/MessageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.route('/:recipientId')
    .get(protect, getMessages)
    .post(protect, sendMessage);

module.exports = router;
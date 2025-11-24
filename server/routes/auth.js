const express = require('express');
const { register, login } = require('../controllers/auth');

// Initialize the Express Router
const router = express.Router();

// Define the endpoints
router.post('/register', register);
router.post('/login', login);

module.exports = router;

// server/routes/profile.js
const express = require('express');
const { getProfile, updateProfile, getMatches } = require('../controllers/profile');
const { protect } = require('../middleware/auth'); // Assuming protect is exported here

const router = express.Router();

// All profile routes are private (require protection)
router.use(protect);

// @desc    Get/Update user's own profile
// @route   GET/PUT /api/v1/profile/me
router.route('/me')
    .get(getProfile)
    .put(updateProfile);

// @desc    Get dating matches (Blind Dating)
// @route   GET /api/v1/profile/match
router.route('/match')
    .get(getMatches);

module.exports = router;
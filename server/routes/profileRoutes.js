const express = require('express');
const { getMeProfile, getDiscoveryProfiles, createUpdateProfile } = require('../controllers/ProfileController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Apply protection middleware to all profile routes
router.use(protect);

// Route to get all profiles for discovery
// GET /api/v1/profiles
router.route('/')
    .get(getDiscoveryProfiles);

// Route for the current user's profile
// GET /api/v1/profiles/me
// PUT /api/v1/profiles/me (Create or Update)
router.route('/me')
    .get(getMeProfile)
    .put(createUpdateProfile);

module.exports = router;

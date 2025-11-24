const Profile = require('../models/Profile'); // Assuming Profile model exists
const User = require('../models/User'); 
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// @desc    Get the current logged-in user's profile
// @route   GET /api/v1/profiles/me
// @access  Private
exports.getMeProfile = asyncHandler(async (req, res, next) => {
    // Find the profile associated with the logged-in user ID
    const profile = await Profile.findOne({ user: req.user.id }).populate({
        path: 'user',
        select: 'name email createdAt' // Populate basic user info
    });

    if (!profile) {
        // If the user exists but no profile object has been created yet, return 404
        return next(new ErrorResponse(`Profile not found for user ID ${req.user.id}`, 404));
    }

    res.status(200).json({
        success: true,
        data: profile
    });
});

// @desc    Get profiles for discovery/matching
// @route   GET /api/v1/profiles
// @access  Private
exports.getDiscoveryProfiles = asyncHandler(async (req, res, next) => {
    const currentUserId = req.user.id;
    
    // Simple Discovery Logic: Fetch 10 random profiles that are NOT the current user
    // In a real dating app, this would use complex filtering (age, distance, preferences)
    
    // We get a list of the 10 most recently updated profiles, excluding the current user.
    const profiles = await Profile.find({ user: { $ne: currentUserId } }) // $ne means "not equal"
        .sort({ updatedAt: -1 }) // Sort by most recently updated profile
        .limit(10)
        .populate({
            path: 'user',
            select: 'name email' // We only need their name and email for display
        });
        
    res.status(200).json({
        success: true,
        count: profiles.length,
        data: profiles
    });
});

// @desc    Create or Update User Profile
// @route   PUT /api/v1/profiles/me
// @access  Private
exports.createUpdateProfile = asyncHandler(async (req, res, next) => {
    const profileFields = {
        user: req.user.id,
        bio: req.body.bio,
        location: req.body.location,
        interests: Array.isArray(req.body.interests) ? req.body.interests : (req.body.interests ? req.body.interests.split(',').map(i => i.trim()) : []),
        // Add more fields here (e.g., age, gender, seeking)
    };
    
    // Look for existing profile
    let profile = await Profile.findOne({ user: req.user.id });
    
    if (profile) {
        // Update existing profile
        profile = await Profile.findOneAndUpdate(
            { user: req.user.id },
            { $set: profileFields },
            { new: true, runValidators: true } // Return the new document and run validation
        ).populate('user');
        
        return res.status(200).json({ success: true, data: profile, message: 'Profile updated' });
    } else {
        // Create new profile
        profile = await Profile.create(profileFields);
        
        // Populate the user data before sending the response
        profile = await Profile.findById(profile._id).populate('user');
        
        return res.status(201).json({ success: true, data: profile, message: 'Profile created' });
    }
});

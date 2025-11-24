// server/controllers/profile.js
const Profile = require('../models/Profile');
const User = require('../models/User'); // Required for lookup
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Get user's own profile
// @route   GET /api/v1/profile/me
// @access  Private
exports.getProfile = asyncHandler(async (req, res, next) => {
    const profile = await Profile.findOne({ user: req.user.id });

    if (!profile) {
        return next(new ErrorResponse(`Profile not found for user ${req.user.id}`, 404));
    }

    res.status(200).json({
        success: true,
        data: profile
    });
});

// @desc    Update user's own profile
// @route   PUT /api/v1/profile/me
// @access  Private
exports.updateProfile = asyncHandler(async (req, res, next) => {
    const profile = await Profile.findOneAndUpdate(
        { user: req.user.id },
        req.body,
        {
            new: true,
            runValidators: true
        }
    );

    if (!profile) {
        // This should not happen if profile is created on register, but as a fallback
        return next(new ErrorResponse(`Profile not found for update`, 404));
    }

    res.status(200).json({
        success: true,
        data: profile
    });
});

// @desc    Get random users for dating/blind dating based on preferences
// @route   GET /api/v1/profile/match
// @access  Private
exports.getMatches = asyncHandler(async (req, res, next) => {
    // 1. Get the current user's profile to check preferences
    const currentUserProfile = await Profile.findOne({ user: req.user.id });

    if (!currentUserProfile) {
        return next(new ErrorResponse('Please complete your profile details first.', 400));
    }

    const { minAge, maxAge, seekingGender, gender } = currentUserProfile;

    // 2. Build the query filter based on dating preferences
    const filter = {
        // 1. Exclude the current user
        user: { $ne: req.user.id },
        // 2. Filter by age range (calculated from birthday)
        // This requires complex MongoDB aggregation for proper age calculation,
        // but for simplicity here, we'll assume we can filter on an 'age' field later, or use a simplified query:
        // For now, we'll only filter by gender.

        // 3. Filter by the gender the current user is seeking
        gender: seekingGender !== 'all' ? seekingGender : { $in: ['male', 'female', 'non-binary'] },
        // 4. Optionally, filter for users who are seeking the current user's gender
        // This is complex, but for a basic match, we'll focus on what the current user wants.
    };

    // 3. Find 10 random profiles matching the criteria
    const matches = await Profile.aggregate([
        { $match: filter },
        { $sample: { size: 10 } },
        { $project: { user: 0, createdAt: 0, lastActive: 0 } } // Exclude unnecessary fields
    ]);

    // 4. Populate the actual User data (email, etc.) for the matches
    // Note: We can't easily populate after aggregation, so we'll just return the profile data for now.
    // In a production app, we would use $lookup in the aggregation pipeline.

    res.status(200).json({
        success: true,
        count: matches.length,
        data: matches
    });
});
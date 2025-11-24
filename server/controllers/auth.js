// server/controllers/auth.js
const User = require('../models/User');
const Profile = require('../models/Profile'); // <-- New Import
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');
const { getSignedJwtToken } = require('../utils/authUtils'); // Assuming you have this helper

// @desc      Register user
// @route     POST /api/v1/auth/register
// @access    Public
exports.register = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;

    // Create user
    const user = await User.create({
        email,
        password
    });

    // Create a corresponding profile immediately
    await Profile.create({
        user: user._id,
        // Default values will be used from the Profile schema
        location: 'Not Specified', // Default mandatory field
        gender: 'male' // Default mandatory field
    });

    sendTokenResponse(user, 201, res);
});

// @desc      Log user in
// @route     POST /api/v1/auth/login
// @access    Public
exports.login = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
        return next(new ErrorResponse('Please provide an email and password', 400));
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
        return next(new ErrorResponse('Invalid credentials', 401));
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
        return next(new ErrorResponse('Invalid credentials', 401));
    }

    sendTokenResponse(user, 200, res);
});

// @desc      Get current logged in user
// @route     GET /api/v1/auth/me
// @access    Private
exports.getMe = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id);
    res.status(200).json({
        success: true,
        data: user
    });
});

// Helper function to send token in cookie
const sendTokenResponse = (user, statusCode, res) => {
    // Create token
    const token = getSignedJwtToken(user); // Assuming this utility function is available

    const options = {
        expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
        httpOnly: true
    };

    if (process.env.NODE_ENV === 'production') {
        options.secure = true;
    }

    res.status(statusCode)
        .cookie('token', token, options)
        .json({
            success: true,
            token
        });
};
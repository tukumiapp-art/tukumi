// server/utils/authUtils.js
const jwt = require('jsonwebtoken');

/**
 * Gets a signed JWT token from a user object.
 * @param {Object} user - The mongoose user object.
 * @returns {string} The signed JWT token.
 */
exports.getSignedJwtToken = (user) => {
    // Generate the token payload from the user ID
    const payload = { id: user._id };

    // Sign the token using the secret and expiry defined in .env
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
};
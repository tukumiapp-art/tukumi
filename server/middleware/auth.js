const jwt = require('jsonwebtoken');
const User = require('../models/User');

// @desc    Protect routes - checks for a valid JWT
exports.protect = async (req, res, next) => {
    let token;

    // 1. Check if token is in the Authorization header (Bearer <token>)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        // Example: 'Bearer 1234abc' -> token = '1234abc'
        token = req.headers.authorization.split(' ')[1];
    } 
    // 2. Check if token is in the cookie (if using cookie-based authentication)
    else if (req.cookies.token) {
        token = req.cookies.token;
    }

    // Make sure token exists
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Not authorized to access this route: No token provided' 
        });
    }

    try {
        // Verify token
        // This will throw an error if the token is invalid or expired
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Fetch the user based on the ID inside the token payload (excluding password)
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found for this token' 
            });
        }

        // Attach the user object to the request so it can be accessed in subsequent controllers
        req.user = user;

        next(); // Proceed to the next middleware or route handler

    } catch (err) {
        console.error('Token Verification Error:', err.message);
        return res.status(401).json({ 
            success: false, 
            error: 'Not authorized to access this route: Token failed validation' 
        });
    }
};

// server/routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/auth');
const ErrorResponse = require('../utils/errorResponse');

const router = express.Router();

// Define storage settings for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Save files to the 'uploads' folder in the root of the server directory
        // We use path.join(__dirname, '..', 'uploads') to point to the server's root level
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: (req, file, cb) => {
        // Create a unique filename: fieldname-timestamp.ext
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// File filter function to accept only images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
        cb(null, true);
    } else {
        // Use the ErrorResponse utility for consistent error handling
        cb(new ErrorResponse('Not an image! Please upload only image files.', 400), false);
    }
};

// Initialize upload middleware
const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB max file size
    fileFilter: fileFilter
});

// @desc    Upload an image
// @route   POST /api/v1/upload
// @access  Private (Requires authentication)
router.post('/', protect, upload.single('image'), (req, res, next) => {
    if (!req.file) {
        return next(new ErrorResponse('Please select an image file to upload.', 400));
    }

    // The server path to access the image (e.g., /uploads/image-12345.jpg)
    const filePath = `/uploads/${req.file.filename}`;

    res.status(200).json({
        success: true,
        data: {
            filePath: filePath
        }
    });
});

module.exports = router;

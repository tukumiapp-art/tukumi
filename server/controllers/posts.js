// server/controllers/posts.js
const Post = require('../models/Post');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middleware/asyncHandler');

// @desc    Create a new post
// @route   POST /api/v1/posts
// @access  Private
exports.createPost = asyncHandler(async (req, res, next) => {
    // req.user is available from the protect middleware
    req.body.user = req.user.id;

    // We can handle image uploads later, but for now assume image path is passed in body if needed
    const post = await Post.create(req.body);

    res.status(201).json({
        success: true,
        data: post
    });
});

// @desc    Get all posts (The "Feed")
// @route   GET /api/v1/posts
// @access  Private
exports.getPosts = asyncHandler(async (req, res, next) => {
    // Fetch all posts, sort by creation date (newest first), and populate the virtual profile field
    const posts = await Post.find()
        .sort('-createdAt')
        .populate({
            path: 'profile',
            select: 'firstName profilePicture location' // Only pull necessary profile fields
        });

    res.status(200).json({
        success: true,
        count: posts.length,
        data: posts
    });
});

// @desc    Like/Unlike a post
// @route   PUT /api/v1/posts/:id/like
// @access  Private
exports.likePost = asyncHandler(async (req, res, next) => {
    const post = await Post.findById(req.params.id);

    if (!post) {
        return next(new ErrorResponse(`Post not found with id of ${req.params.id}`, 404));
    }

    const userId = req.user.id;

    // Check if the user has already liked the post
    if (post.likes.includes(userId)) {
        // If liked, remove the like (unlike)
        post.likes = post.likes.filter(id => id.toString() !== userId);
    } else {
        // If not liked, add the like
        post.likes.push(userId);
    }

    await post.save();

    res.status(200).json({
        success: true,
        data: post.likes
    });
});
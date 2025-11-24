const Post = require('../models/PostModel');
const Profile = require('../models/Profile'); // ✅ Correct import
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// ✅ Helper function to populate post data consistently
const populatePost = (query) => {
    return query
        .populate({
            path: 'user',
            select: 'name' // ✅ Pull the name from User model
        })
        .populate({
            path: 'profile',
            select: 'profilePicture' // ✅ Pull profile picture from Profile
        })
        .populate({
            path: 'comments.user',
            select: 'name' // ✅ Include commenter name
        });
};

// @desc    Get all posts
// @route   GET /api/v1/posts
// @access  Public
exports.getPosts = asyncHandler(async (req, res, next) => {
    let query = Post.find().sort({ createdAt: -1 });
    const posts = await populatePost(query);

    res.status(200).json({
        success: true,
        count: posts.length,
        data: posts
    });
});

// @desc    Create new post
// @route   POST /api/v1/posts
// @access  Private
exports.createPost = asyncHandler(async (req, res, next) => {
    req.body.user = req.user.id;
    
    const profile = await Profile.findOne({ user: req.user.id });
    if (!profile) {
        return next(new ErrorResponse('Profile not found for this user.', 404));
    }

    req.body.profile = profile._id;

    const post = await Post.create(req.body);

    const newPost = await populatePost(Post.findById(post._id));

    res.status(201).json({
        success: true,
        data: newPost
    });
});

// @desc    Like or Unlike a post
// @route   PUT /api/v1/posts/:id/like
// @access  Private
exports.likePost = asyncHandler(async (req, res, next) => {
    const post = await Post.findById(req.params.id);

    if (!post) {
        return next(new ErrorResponse(`Post not found with id of ${req.params.id}`, 404));
    }

    // Toggle like
    if (post.likes.includes(req.user.id)) {
        post.likes.pull(req.user.id);
    } else {
        post.likes.push(req.user.id);
    }

    await post.save();

    const updatedPost = await populatePost(Post.findById(req.params.id));

    res.status(200).json({
        success: true,
        data: updatedPost
    });
});

// @desc    Add a comment to a post
// @route   POST /api/v1/posts/:id/comment
// @access  Private
exports.addCommentToPost = asyncHandler(async (req, res, next) => {
    const { text } = req.body;
    const postId = req.params.id;
    const userId = req.user.id;

    if (!text || text.trim() === '') {
        return next(new ErrorResponse('Comment text cannot be empty.', 400));
    }

    const post = await Post.findById(postId);
    if (!post) {
        return next(new ErrorResponse(`Post not found with id of ${postId}`, 404));
    }

    const profile = await Profile.findOne({ user: userId });
    if (!profile) {
        return next(new ErrorResponse('Profile not found for this user.', 404));
    }

    const newComment = {
        user: userId,
        profile: profile._id,
        text: text
    };

    const updatedPost = await Post.findByIdAndUpdate(
        postId,
        { $push: { comments: newComment } },
        { new: true, runValidators: true }
    );

    const fullyPopulatedPost = await populatePost(Post.findById(updatedPost._id));
    
    res.status(201).json({
        success: true,
        data: fullyPopulatedPost
    });
});

// @desc    Delete post
// @route   DELETE /api/v1/posts/:id
// @access  Private
exports.deletePost = asyncHandler(async (req, res, next) => {
    const post = await Post.findById(req.params.id);

    if (!post) {
        return next(new ErrorResponse(`Post not found with id of ${req.params.id}`, 404));
    }

    // Ensure only owner can delete
    if (post.user.toString() !== req.user.id) {
        return next(new ErrorResponse(`User ${req.user.id} is not authorized to delete this post`, 401));
    }

    await post.deleteOne();

    res.status(200).json({
        success: true,
        data: {}
    });
});

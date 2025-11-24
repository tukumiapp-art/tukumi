const express = require('express');
const {
    getPosts,
    createPost,
    likePost, // <-- Ensure this is exported from PostController.js
    addCommentToPost, // <-- Ensure this is exported from PostController.js
    deletePost
} = require('../controllers/PostController');

// Ensure this path is correct: it must point to server/middleware/auth.js
const { protect } = require('../middleware/auth'); 

const router = express.Router();

// Public route to get all posts (no login required for viewing feed)
router.route('/')
    .get(getPosts)
    .post(protect, createPost); // Creating a post requires login

// Protected route for liking a post (PUT request)
router.route('/:id/like')
    .put(protect, likePost); // Uses 'likePost' controller function

// Protected route for adding a comment to a post (POST request)
router.route('/:id/comment')
    .post(protect, addCommentToPost); // Uses 'addCommentToPost' controller function

// Protected route to delete a post
router.route('/:id')
    .delete(protect, deletePost);

module.exports = router;
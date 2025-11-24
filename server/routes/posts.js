// server/routes/posts.js
const express = require('express');
const { protect } = require('../middleware/auth');
const {
    createPost,
    getPosts,
    likePost
} = require('../controllers/posts');

const router = express.Router();

// All post routes require authentication (protect middleware)
router.use(protect);

router.route('/')
    .get(getPosts)
    .post(createPost);

router.route('/:id/like')
    .put(likePost);

module.exports = router;
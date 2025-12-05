// server/models/Post.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: [true, 'A post must have content.']
    },
    image: {
        type: String, // Storing the path to the image uploaded via Multer
        default: null
    },
    likes: {
        type: [mongoose.Schema.ObjectId],
        ref: 'User',
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    // This ensures virtuals (like user profile info) are included when fetching posts
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Reverse populate with user profile information (Virtual field for easy access)
PostSchema.virtual('profile', {
    ref: 'Profile', // The model to use
    localField: 'user', // Find Profile where 'user' matches this Post's 'user' field
    foreignField: 'user', // The field in the Profile model to match
    justOne: true // We only expect one profile per user
});


module.exports = mongoose.model('Post', PostSchema);
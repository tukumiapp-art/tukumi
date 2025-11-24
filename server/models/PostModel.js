const mongoose = require('mongoose');

// Define the schema for a single Comment
const CommentSchema = new mongoose.Schema({
    // Store the ID of the user who made the comment
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // The content of the comment
    text: {
        type: String,
        required: [true, 'Comment text is required.'],
        trim: true,
        maxlength: [500, 'Comment must be less than 500 characters.'],
    },
    // Timestamp for when the comment was created
    createdAt: {
        type: Date,
        default: Date.now,
    }
}, { _id: true }); // We want an ID for each comment for future use (like deleting)


// Define the main Post Schema
const PostSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    text: {
        type: String,
        trim: true,
        maxlength: [1000, 'Post text cannot exceed 1000 characters.'],
    },
    image: {
        type: String,
        default: null, // Path to the uploaded image/video file
    },
    likes: [ // Array of User IDs who liked the post
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    ],
    // New: Array to hold all comments on the post
    comments: [CommentSchema],
    
    // Virtual field for easy profile population (as discussed previously)
    profile: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Profile',
        default: null, // Will be set on the pre-save hook
    },
}, { timestamps: true });

// Pre-save hook to automatically find and attach the Profile ID
PostSchema.pre('save', async function(next) {
    if (this.isNew || this.isModified('user')) {
        try {
            const Profile = mongoose.model('Profile');
            const profile = await Profile.findOne({ user: this.user });
            if (profile) {
                this.profile = profile._id;
            }
        } catch (error) {
            console.error('Error attaching profile ID to post:', error);
            // Optionally handle this error more gracefully
        }
    }
    next();
});

const Post = mongoose.model('Post', PostSchema);

module.exports = Post;

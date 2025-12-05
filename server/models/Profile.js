// server/models/Profile.js
const mongoose = require('mongoose');

const ProfileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    // General Social Fields
    firstName: {
        type: String,
        trim: true,
        maxlength: [30, 'First name cannot be more than 30 characters']
    },
    lastName: {
        type: String,
        trim: true,
        maxlength: [30, 'Last name cannot be more than 30 characters']
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot be more than 500 characters']
    },
    profilePicture: {
        type: String,
        default: '/uploads/default-profile.png'
    },
    birthday: {
        type: Date
    },
    location: {
        type: String,
        required: [true, 'Please add a location']
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'non-binary'],
        required: [true, 'Please specify your gender']
    },
    interests: {
        type: [String], // Array of strings (e.g., ['hiking', 'reading'])
    },
    // Dating Specific Fields
    seekingGender: {
        type: String,
        enum: ['male', 'female', 'non-binary', 'all'],
        default: 'all'
    },
    minAge: {
        type: Number,
        min: 18,
        default: 18
    },
    maxAge: {
        type: Number,
        min: 18,
        default: 99
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Profile', ProfileSchema);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
    name: { // <-- THIS IS THE CRUCIAL FIELD ADDED
        type: String,
        required: [true, 'Please add a name'],
        trim: true,
        maxlength: [50, 'Name can not be more than 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
        // When finding a user from the DB, don't return the password field by default
        select: false 
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// === Mongoose Middleware (Hooks) ===

// Encrypt password using bcrypt BEFORE saving
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        next();
    }
    // Generate salt and hash the password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// === User Schema Methods ===

// Sign JWT and return
UserSchema.methods.getSignedJwtToken = function () {
    // Uses the JWT_SECRET and JWT_EXPIRE from the .env file
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
};

// Compare user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
    // bcrypt.compare compares a plain text password to a hashed password
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);

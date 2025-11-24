const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    // --- GROUPS ---
    isGroup: {
        type: Boolean,
        default: false
    },
    groupName: {
        type: String,
        trim: true
    },
    groupAdmin: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    
    // --- PARTICIPANTS ---
    participants: [{
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    }],
    
    // --- MESSAGES ---
    messages: [{
        sender: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true
        },
        text: {
            type: String,
            default: ""
        },
        mediaURL: { type: String },
        mediaType: { type: String, enum: ['text', 'image', 'video', 'audio', 'file'], default: 'text' },
        fileName: { type: String }, // For non-media files
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    
    lastMessage: {
        type: String,
        maxlength: 500
    },
    lastMessageSenderId: { 
        type: String 
    },
    
    updatedAt: {
        type: Date,
        default: Date.now
    },
    
    // Unread counts map
    unreadCounts: {
        type: Map,
        of: Number,
        default: {} 
    }
}, {
    timestamps: true
});

// Index for fast lookup
MessageSchema.index({ participants: 1 });

module.exports = mongoose.model('Message', MessageSchema);
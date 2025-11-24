const Message = require('../models/MessageModel');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// Helper function to sort participants alphabetically
const sortParticipants = (userId1, userId2) => {
    return [userId1, userId2].sort();
};

// @desc    Get all messages between two users (or start a new conversation)
// @route   GET /api/v1/messages/:recipientId
// @access  Private
exports.getMessages = asyncHandler(async (req, res, next) => {
    // The current logged-in user is the sender (req.user.id)
    const senderId = req.user.id;
    const recipientId = req.params.recipientId;

    // Sort the IDs to ensure we always look up the conversation ID consistently
    const participants = sortParticipants(senderId, recipientId);

    // Find the conversation. We use lean() for faster read access.
    let conversation = await Message.findOne({
        participants: { $all: participants }
    })
    .populate({
        path: 'participants',
        select: 'name email' // Populate user details
    })
    .lean();

    // If no conversation exists, create a new one, but don't save any messages yet.
    if (!conversation) {
        conversation = await Message.create({
            participants,
            messages: [],
            lastMessage: 'Conversation started.'
        });

        // Refetch with population for consistent response structure
        conversation = await Message.findById(conversation._id)
            .populate({
                path: 'participants',
                select: 'name email'
            })
            .lean();
    }
    
    res.status(200).json({
        success: true,
        data: conversation,
        messages: conversation.messages // Send the array of messages for the client to display
    });
});


// @desc    Send a new message
// @route   POST /api/v1/messages/:recipientId
// @access  Private
exports.sendMessage = asyncHandler(async (req, res, next) => {
    const senderId = req.user.id;
    const recipientId = req.params.recipientId;
    const { text } = req.body;

    if (!text || text.trim() === '') {
        return next(new ErrorResponse('Message text cannot be empty', 400));
    }
    
    // Sort the IDs to consistently find the right conversation
    const participants = sortParticipants(senderId, recipientId);

    // 1. Find the conversation or create it if it doesn't exist
    let conversation = await Message.findOne({
        participants: { $all: participants }
    });

    if (!conversation) {
        // Create a new conversation if it's the first message
        conversation = await Message.create({
            participants,
            messages: [], // Start with an empty message array
            lastMessage: text
        });
    }

    // 2. Prepare the new message object
    const newMessage = {
        sender: senderId,
        text: text,
        createdAt: new Date()
    };

    // 3. Add the new message and update lastMessage field
    conversation.messages.push(newMessage);
    conversation.lastMessage = text;
    conversation.updatedAt = new Date(); // Update the timestamp for sorting conversations

    await conversation.save();

    res.status(201).json({
        success: true,
        data: newMessage // Send back the new message object
    });
});

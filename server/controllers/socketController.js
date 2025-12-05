// This module will hold functions that interact directly with the Socket.IO instance (io).
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

// This variable will hold the Socket.IO server instance, passed from server.js.
let io;

// Function to initialize the io instance. Called from server.js.
exports.setSocketIo = (socketIoInstance) => {
    io = socketIoInstance;
    console.log('Socket.IO instance successfully attached to the Socket Controller.');
};

// @desc    Initiate a Video/Audio Call
// @route   POST /api/v1/realtime/call/:recipientId
// @access  Private
// This route is called by the client to tell the server: "I want to call user X."
exports.initiateCall = asyncHandler(async (req, res, next) => {
    if (!io) {
        return next(new ErrorResponse('Real-time service is unavailable.', 503));
    }
    
    const recipientId = req.params.recipientId;
    const callerId = req.user.id;
    const { offer } = req.body; // WebRTC offer is sent in the body
    
    // We assume here that the recipient's Socket.ID is easily derived or mapped,
    // but for simplicity in this backend, we'll try to use the recipientId as the room name 
    // where they have joined (which should happen on login).
    const recipientRoom = recipientId; 

    // 1. Check if the recipient is currently online (has a socket connection in their "room")
    // Note: The actual implementation for this check is complex. For now, we assume if they have joined their user ID room, they are reachable.
    const socketsInRoom = await io.in(recipientRoom).fetchSockets();

    if (socketsInRoom.length === 0) {
        // If the recipient is not online or hasn't joined their room (using their userId),
        // we cannot proceed with the call.
        return next(new ErrorResponse(`Recipient ${recipientId} is currently offline or unreachable.`, 404));
    }

    // 2. Emit the call request via Socket.IO
    // This uses the 'incoming_call' event we defined in server.js
    io.to(recipientRoom).emit('incoming_call', {
        callerId: callerId, 
        offer: offer, 
        callerName: req.user.name || 'Anonymous User' // Use the user's name
    });
    
    console.log(`Call initiated from ${callerId} to ${recipientId}. Signaling sent.`);

    res.status(200).json({
        success: true,
        message: 'Call signaling sent successfully.'
    });
});

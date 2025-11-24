// @desc    Initiate a call by sending the SDP offer to the recipient via Socket.IO
// @route   POST /api/v1/realtime/call/:recipientId
// @access  Public (for this demo, as auth happens in App.jsx via Firebase)
exports.initiateCall = async (req, res, next) => {
    const { recipientId } = req.params;
    const { offer, callerName } = req.body;
    
    // The req.io and req.userSocketMap are attached in server.js middleware
    const io = req.io;
    const userSocketMap = req.userSocketMap;

    // The caller's ID is expected to be passed in the body or derived from a separate auth mechanism
    // For this implementation, we will assume callerName is the callerId for simplicity
    const callerId = callerName; 
    
    const recipientSocketId = userSocketMap[recipientId];

    if (!recipientSocketId) {
        // If the recipient is not online, reject the call
        return res.status(404).json({
            success: false,
            error: `Recipient ${recipientId} is currently offline or unavailable.`
        });
    }

    try {
        // Emit an 'incoming_call' event to the recipient's socket
        io.to(recipientSocketId).emit('incoming_call', {
            callerId: callerId,
            callerName: callerName,
            offer: offer, // The initial SDP offer from the caller
        });

        // Respond to the caller (client) that the call notification was successfully sent
        res.status(200).json({
            success: true,
            message: `Call notification sent to ${recipientId}.`,
        });

    } catch (err) {
        console.error('Error initiating call:', err.message);
        res.status(500).json({
            success: false,
            error: 'Server error while sending call notification.'
        });
    }
};

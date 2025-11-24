// This file will manage all your real-time socket logic.
const { Server } = require("socket.io");

let io;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*", // In production, restrict this to your client's URL
      methods: ["GET", "POST"],
    },
  });

  console.log("Socket.IO initialized.");

  // Store users who are online
  // For 20M users, this CANNOT be an in-memory object.
  // You MUST use Redis for this in production. But for development, this is fine.
  let onlineUsers = {};

  io.on("connection", (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // Listen for a user to come online
    socket.on("user-online", (userId) => {
      console.log(`User ${userId} is online.`);
      onlineUsers[userId] = socket.id;
      // Let all clients know who is online
      io.emit("online-users-updated", Object.keys(onlineUsers));
    });

    // Listen for a private message
    socket.on("send-private-message", (data) => {
      // data should look like { recipientId, senderId, message }
      const recipientSocketId = onlineUsers[data.recipientId];

      if (recipientSocketId) {
        // User is online, send it directly
        io.to(recipientSocketId).emit("new-private-message", data);
      } else {
        // User is offline. The MessageController already saved it to the DB,
        // so they will get it when they next log in and fetch messages.
        // You could also implement a push notification here.
      }
    });

    // Listen for disconnections
    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Find which user this socket belonged to and remove them
      let disconnectedUserId = null;
      for (const userId in onlineUsers) {
        if (onlineUsers[userId] === socket.id) {
          disconnectedUserId = userId;
          delete onlineUsers[userId];
          break;
        }
      }
      if (disconnectedUserId) {
        // Let all clients know this user is offline
        io.emit("online-users-updated", Object.keys(onlineUsers));
      }
    });
  });

  return io;
}

// Function to get the IO instance if needed in other files (like controllers)
function getIO() {
  if (!io) {
    throw new Error("Socket.IO not initialized!");
  }
  return io;
}

module.exports = { initializeSocket, getIO };

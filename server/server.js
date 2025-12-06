const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const admin = require("firebase-admin");
const path = require("path");
const cors = require("cors"); // You might need to run: npm install cors
const dotenv = require("dotenv");
const connectDB = require("./config/db"); // Import your DB connection

// Load env vars
dotenv.config();

// Connect to MongoDB (Atlas)
connectDB();

// --- Firebase Admin Setup ---
let adminDb;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    let serviceAccount;
    
    // Check if the environment variable starts with "{" implies it's a JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT.trim().startsWith("{")) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      // Otherwise, treat it as a file path
      // We use path.resolve to ensure we get the absolute path
      serviceAccount = require(path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT));
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    adminDb = admin.firestore();
    console.log("✅ Firebase Admin SDK initialized.");
  } catch (error) {
    console.error("❌ Firebase Error:", error.message);
  }
}

const app = express();
const httpServer = http.createServer(app);

// Setup Socket.IO with CORS
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for now (tighten this for production security)
    methods: ["GET", "POST"],
  },
});

// Pass io instance to request object so controllers can use it
app.use((req, res, next) => {
  req.io = io;
  // In a real app, use Redis for userSocketMap. Memory object resets on restart.
  if (!global.userSocketMap) global.userSocketMap = {};
  req.userSocketMap = global.userSocketMap;
  next();
});

// --- Middleware ---
app.use(cors()); // Enable CORS for API routes
app.use(express.json()); // Parse JSON bodies

// --- Route Files ---
const auth = require("./routes/auth");
const posts = require("./routes/postRoutes");// uses routes/posts.js
const profile = require("./routes/profileRoutes");// uses routes/profile.js
const messages = require("./routes/messageRoutes");
const realtime = require("./routes/realtime");
const upload = require("./routes/upload");
const items = require("./routes/items");

// --- Mount Routers ---
app.use("/api/v1/auth", auth);
app.use("/api/v1/posts", posts);
app.use("/api/v1/profile", profile);
app.use("/api/v1/messages", messages);
app.use("/api/v1/realtime", realtime);
app.use("/api/v1/upload", upload);
app.use("/api/v1/items", items);

// --- Serve Uploads Folder ---
// Make the uploads folder accessible publicly (for profile pics/post images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Serve Frontend ---
// This serves the React app build when the API routes are not hit
// It is no longer conditional on process.env.NODE_ENV
// --- Serve Frontend ---
// CHANGED: Point to '../client/dist' where Vite actually builds the app
app.use(express.static(path.join(__dirname, "../client/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../client/dist", "index.html"));
});


// --- Socket.IO Logic ---
io.on("connection", (socket) => {
  console.log(`🟢 Socket Connected: ${socket.id}`);

  // User joins their own room (using their User ID) for targeted calls/messages
  socket.on("join", (userId) => {
    global.userSocketMap[userId] = socket.id;
    socket.join(userId);
    console.log(`👤 User ${userId} joined room ${userId}`);
  });

  socket.on("disconnect", () => {
    console.log(`🔴 Socket Disconnected: ${socket.id}`);
    // Cleanup user from map
    Object.keys(global.userSocketMap).forEach(key => {
      if (global.userSocketMap[key] === socket.id) {
        delete global.userSocketMap[key];
      }
    });
  });
});

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
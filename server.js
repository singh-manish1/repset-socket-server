/* * REPSET EXTERNAL SOCKET SERVER v1.0
 * The Central Hub connecting Web Admin Dashboards to Physical Gym Hardware.
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";

// 1. Setup & Config
dotenv.config();
const PORT = process.env.PORT || 3001;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
    console.error("❌ FATAL ERROR: ADMIN_SECRET is missing in .env");
    process.exit(1);
}

// 2. Initialize Express & HTTP Server
const app = express();
app.use(cors());

// Health Check Endpoint (Required for Cloud Hosting like Render/AWS)
app.get("/", (req, res) => {
    res.status(200).send("✅ Repset Traffic Control is Online");
});

const httpServer = createServer(app);

// 3. Initialize Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow connections from Vercel (Next.js) and Gym IPs
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000, // Keep connection alive longer if network is slow
});

// 4. In-Memory Tracking (Who is online?)
// Map<GymID, SocketID>
const onlineBridges = new Map();

// --- SOCKET LOGIC ---
io.on("connection", (socket) => {
    // A. AUTHENTICATION HANDSHAKE
    const { gymId, secret, type } = socket.handshake.auth;

    // Security Check 1: Is the secret valid?
    if (secret !== ADMIN_SECRET) {
        console.log(`🚫 Auth Failed: Invalid Secret from ${socket.id}`);
        socket.emit("error", { message: "Authentication Failed: Invalid Secret" });
        socket.disconnect();
        return;
    }

    // Security Check 2: Is a Gym ID provided?
    if (!gymId) {
        console.log(`🚫 Auth Failed: Missing Gym ID from ${socket.id}`);
        socket.disconnect();
        return;
    }

    // B. JOIN ROOM (ISOLATION)
    // We create a "Room" named after the Gym ID. 
    // Admin and Bridge for the same gym join this room.
    const roomName = `gym_${gymId}`;
    socket.join(roomName);

    // C. IDENTIFY CLIENT TYPE
    if (type === "BRIDGE") {
        handleBridgeConnection(socket, gymId, roomName);
    } else if (type === "ADMIN") {
        handleAdminConnection(socket, gymId, roomName);
    } else {
        console.log(`❓ Unknown Client Type connected to ${gymId}`);
    }

    // --- EVENT HANDLERS ---

    // 1. ADMIN -> HARDWARE
    // Example: Admin clicks "Unlock Door"
    socket.on("cloud-command", (payload) => {
        // payload: { action: "UNLOCK", userId: "101" }
        console.log(`[${gymId}] 📨 Command: ${payload.action}`);

        // Broadcast ONLY to the specific gym room, excluding the sender
        socket.to(roomName).emit("cloud-command", payload);
    });

    // 2. HARDWARE -> ADMIN
    // Example: User scans finger -> Bridge sends event -> Dashboard updates
    socket.on("hardware-event", (payload) => {
        // payload: { type: "ATTENDANCE", userId: 101, timestamp: ... }
        console.log(`[${gymId}] 📡 Hardware Event: ${payload.type}`);

        // Broadcast to Admin UI in the same room
        socket.to(roomName).emit("hardware-event", payload);
    });

    // 3. DISCONNECT
    socket.on("disconnect", (reason) => {
        if (type === "BRIDGE") {
            console.log(`⚠️  BRIDGE Lost: ${gymId} (${reason})`);
            onlineBridges.delete(gymId);
            // Notify any listening Admins that bridge is offline
            io.to(roomName).emit("bridge-status", { status: "OFFLINE" });
        }
    });
});

// Helper: Handle Bridge Specific Logic
function handleBridgeConnection(socket, gymId, roomName) {
    console.log(`✅ BRIDGE Online for Gym: ${gymId}`);
    onlineBridges.set(gymId, socket.id);

    // Notify Admins in the room
    io.to(roomName).emit("bridge-status", { status: "ONLINE" });
}

// Helper: Handle Admin Specific Logic
function handleAdminConnection(socket, gymId, roomName) {
    console.log(`👨‍💻 ADMIN viewing Dashboard for Gym: ${gymId}`);

    // Immediately tell Admin if the bridge is currently online
    const isOnline = onlineBridges.has(gymId);
    socket.emit("bridge-status", { status: isOnline ? "ONLINE" : "OFFLINE" });
}

// 5. START SERVER
httpServer.listen(PORT, () => {
    console.log("--------------------------------------------------");
    console.log(`🚀 REPSET SOCKET SERVER READY`);
    console.log(`👉 Listening on PORT: ${PORT}`);
    console.log(`🔐 Admin Secret Configured`);
    console.log("--------------------------------------------------");
});
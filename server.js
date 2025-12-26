/* * REPSET EXTERNAL SOCKET SERVER v2.0
 * The Central Hub connecting Web Admin Dashboards to Physical Gym Hardware.
 * NOW WITH DATABASE LOGGING
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch";

// 1. Setup & Config
dotenv.config();
const PORT = process.env.PORT || 3001;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://your-app.vercel.app/api/webhooks/biometric-events";
const BIOMETRIC_WEBHOOK_SECRET = process.env.BIOMETRIC_WEBHOOK_SECRET;

if (!ADMIN_SECRET) {
    console.error("❌ FATAL ERROR: ADMIN_SECRET is missing in .env");
    process.exit(1);
}

if (!BIOMETRIC_WEBHOOK_SECRET) {
    console.error("⚠️  WARNING: BIOMETRIC_WEBHOOK_SECRET is missing - database logging will fail");
}

// 2. Initialize Express & HTTP Server
const app = express();
app.use(cors());

// Health Check Endpoint (Required for Cloud Hosting like Render/AWS)
app.get("/", (_req, res) => {
    res.status(200).send("✅ Repset Traffic Control is Online v2.0");
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

// 5. Database Logging Function with Retry Logic
async function logToDatabase(eventData, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...eventData,
                    secret: BIOMETRIC_WEBHOOK_SECRET
                }),
                timeout: 5000
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            console.log(`✅ Event logged to database: ${eventData.type}`);
            return true;

        } catch (error) {
            console.error(`❌ Database logging attempt ${attempt}/${retries} failed:`, error.message);
            
            if (attempt === retries) {
                // Final failure - log critical error
                console.error(`🚨 CRITICAL: Failed to log event after ${retries} attempts`, eventData);
                return false;
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

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
        handleBridgeConnection(socket, gymId);
    } else if (type === "ADMIN") {
        handleAdminConnection(socket, gymId);
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

    // 2. HARDWARE -> ADMIN (WITH DATABASE LOGGING)
    // Example: User scans finger -> Bridge sends event -> Dashboard updates
    socket.on("hardware-event", async (payload) => {
        // payload: { type: "ATTENDANCE", userId: 101, timestamp: ... }
        console.log(`[${gymId}] 📡 Hardware Event: ${payload.type} - User ${payload.userId}`);

        // Log to database asynchronously (don't block the event broadcast)
        logToDatabase({
            type: payload.type,
            userId: payload.userId,
            gymId: gymId,
            timestamp: payload.timestamp || new Date().toISOString()
        }).catch(err => {
            console.error('Database logging failed:', err);
        });

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
function handleBridgeConnection(socket, gymId) {
    console.log(`✅ BRIDGE Online for Gym: ${gymId}`);
    onlineBridges.set(gymId, socket.id);

    // Notify Admins in the room
    io.to(`gym_${gymId}`).emit("bridge-status", { status: "ONLINE" });
}

// Helper: Handle Admin Specific Logic
function handleAdminConnection(socket, gymId) {
    console.log(`👨‍💻 ADMIN viewing Dashboard for Gym: ${gymId}`);

    // Immediately tell Admin if the bridge is currently online
    const isOnline = onlineBridges.has(gymId);
    socket.emit("bridge-status", { status: isOnline ? "ONLINE" : "OFFLINE" });
}

// 6. START SERVER
httpServer.listen(PORT, () => {
    console.log("--------------------------------------------------");
    console.log(`🚀 REPSET SOCKET SERVER READY v2.0`);
    console.log(`👉 Listening on PORT: ${PORT}`);
    console.log(`🔐 Admin Secret Configured`);
    console.log(`📊 Database Logging: ${BIOMETRIC_WEBHOOK_SECRET ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🔗 Webhook URL: ${WEBHOOK_URL}`);
    console.log("--------------------------------------------------");
});
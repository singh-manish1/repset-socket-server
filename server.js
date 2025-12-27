/* * REPSET EXTERNAL SOCKET SERVER v3.0
 * The Central Hub connecting Web Admin Dashboards to Physical Gym Hardware.
 * Production-Ready with Comprehensive Biometric Device Support
 */

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import fetch from "node-fetch";

// --- CONSTANTS & ENUMS ---
const COMMAND_TYPES = {
    ENROLL_FINGERPRINT: "ENROLL_FINGERPRINT",
    DELETE_FINGERPRINT: "DELETE_FINGERPRINT",
    VERIFY_FINGERPRINT: "VERIFY_FINGERPRINT",
    UNLOCK_DOOR: "UNLOCK_DOOR",
    LOCK_DOOR: "LOCK_DOOR",
    SYNC_USERS: "SYNC_USERS",
    REBOOT_DEVICE: "REBOOT_DEVICE",
    GET_DEVICE_STATUS: "GET_DEVICE_STATUS",
    CLEAR_ALL_FINGERPRINTS: "CLEAR_ALL_FINGERPRINTS"
};

const EVENT_TYPES = {
    ATTENDANCE: "ATTENDANCE",
    ENROLLMENT_SUCCESS: "ENROLLMENT_SUCCESS",
    ENROLLMENT_FAILED: "ENROLLMENT_FAILED",
    DELETION_SUCCESS: "DELETION_SUCCESS",
    DELETION_FAILED: "DELETION_FAILED",
    VERIFICATION_SUCCESS: "VERIFICATION_SUCCESS",
    VERIFICATION_FAILED: "VERIFICATION_FAILED",
    DOOR_UNLOCKED: "DOOR_UNLOCKED",
    DOOR_LOCKED: "DOOR_LOCKED",
    DEVICE_ERROR: "DEVICE_ERROR",
    DEVICE_STATUS: "DEVICE_STATUS",
    SYNC_COMPLETE: "SYNC_COMPLETE",
    UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS"
};

const ERROR_CODES = {
    INVALID_PAYLOAD: "INVALID_PAYLOAD",
    MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
    INVALID_COMMAND: "INVALID_COMMAND",
    BRIDGE_OFFLINE: "BRIDGE_OFFLINE",
    DATABASE_ERROR: "DATABASE_ERROR",
    TIMEOUT: "TIMEOUT",
    AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED"
};

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
// Map<GymID, { socketId, connectedAt, lastHeartbeat }>
const onlineBridges = new Map();
// Map<GymID, Map<commandId, { timestamp, timeoutId }>>
const pendingCommands = new Map();

// 5. Validation Functions
function validateCloudCommand(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['Payload must be an object'] };
    }

    if (!payload.action || typeof payload.action !== 'string') {
        errors.push('Missing or invalid "action" field');
    }

    if (!payload.commandId || typeof payload.commandId !== 'string') {
        errors.push('Missing or invalid "commandId" field');
    }

    // Command-specific validation
    switch (payload.action) {
        case COMMAND_TYPES.ENROLL_FINGERPRINT:
            if (!payload.userId) errors.push('Missing "userId" for enrollment');
            // fingerprintId should NOT be pre-assigned - device generates it
            if (payload.fingerprintId) {
                errors.push('Do not pre-assign "fingerprintId" - device will generate it');
            }
            break;

        case COMMAND_TYPES.DELETE_FINGERPRINT:
            if (!payload.userId && !payload.fingerprintId) {
                errors.push('Must provide either "userId" or "fingerprintId" for deletion');
            }
            break;

        case COMMAND_TYPES.VERIFY_FINGERPRINT:
            if (!payload.userId) errors.push('Missing "userId" for verification');
            break;

        case COMMAND_TYPES.SYNC_USERS:
            if (!Array.isArray(payload.users)) {
                errors.push('Missing or invalid "users" array for sync');
            } else {
                payload.users.forEach((user, idx) => {
                    if (!user.userId) errors.push(`User at index ${idx} missing "userId"`);
                });
            }
            break;

        case COMMAND_TYPES.UNLOCK_DOOR:
        case COMMAND_TYPES.LOCK_DOOR:
        case COMMAND_TYPES.REBOOT_DEVICE:
        case COMMAND_TYPES.GET_DEVICE_STATUS:
        case COMMAND_TYPES.CLEAR_ALL_FINGERPRINTS:
            // No additional validation needed
            break;

        default:
            errors.push(`Unknown command action: ${payload.action}`);
    }

    return { valid: errors.length === 0, errors };
}

function validateHardwareEvent(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['Payload must be an object'] };
    }

    if (!payload.type || typeof payload.type !== 'string') {
        errors.push('Missing or invalid "type" field');
    }

    if (!payload.eventId || typeof payload.eventId !== 'string') {
        errors.push('Missing or invalid "eventId" field');
    }

    if (!payload.timestamp || typeof payload.timestamp !== 'string') {
        errors.push('Missing or invalid "timestamp" field');
    }

    // Event-specific validation
    switch (payload.type) {
        case EVENT_TYPES.ATTENDANCE:
            // Bridge sends fingerprintId, not userId (server must look up userId)
            if (!payload.fingerprintId) errors.push('Missing "fingerprintId" for attendance');
            if (typeof payload.matchScore !== 'number') errors.push('Missing or invalid "matchScore"');
            break;

        case EVENT_TYPES.UNAUTHORIZED_ACCESS:
            // No userId or fingerprintId - just attemptCount
            if (typeof payload.attemptCount !== 'number') errors.push('Missing or invalid "attemptCount"');
            break;

        case EVENT_TYPES.ENROLLMENT_SUCCESS:
            if (!payload.userId) errors.push('Missing "userId" for enrollment');
            if (!payload.fingerprintId) errors.push('Missing "fingerprintId" for enrollment');
            if (!payload.commandId) errors.push('Missing "commandId" for enrollment response');
            break;

        case EVENT_TYPES.ENROLLMENT_FAILED:
            if (!payload.commandId) errors.push('Missing "commandId" for failure response');
            if (!payload.userId) errors.push('Missing "userId" for enrollment failure');
            if (!payload.error) errors.push('Missing "error" message for failure');
            if (!payload.errorCode) errors.push('Missing "errorCode" for failure');
            break;

        case EVENT_TYPES.DELETION_SUCCESS:
            if (!payload.commandId) errors.push('Missing "commandId" for deletion response');
            // Either userId or fingerprintId must be present
            if (!payload.userId && !payload.fingerprintId) {
                errors.push('Missing "userId" or "fingerprintId" for deletion');
            }
            break;

        case EVENT_TYPES.DELETION_FAILED:
            if (!payload.commandId) errors.push('Missing "commandId" for failure response');
            if (!payload.error) errors.push('Missing "error" message for failure');
            if (!payload.errorCode) errors.push('Missing "errorCode" for failure');
            break;

        case EVENT_TYPES.VERIFICATION_SUCCESS:
            if (!payload.commandId) errors.push('Missing "commandId" for verification response');
            if (!payload.userId) errors.push('Missing "userId" for verification');
            if (typeof payload.matchScore !== 'number') errors.push('Missing or invalid "matchScore"');
            break;

        case EVENT_TYPES.VERIFICATION_FAILED:
            if (!payload.commandId) errors.push('Missing "commandId" for failure response');
            if (!payload.error) errors.push('Missing "error" message for failure');
            if (!payload.errorCode) errors.push('Missing "errorCode" for failure');
            break;

        case EVENT_TYPES.DOOR_UNLOCKED:
            if (!payload.commandId) errors.push('Missing "commandId" for door unlock response');
            break;

        case EVENT_TYPES.DOOR_LOCKED:
            // commandId may be null for auto-lock
            break;

        case EVENT_TYPES.SYNC_COMPLETE:
            if (!payload.commandId) errors.push('Missing "commandId" for sync response');
            if (typeof payload.syncedCount !== 'number') errors.push('Missing or invalid "syncedCount"');
            if (typeof payload.failedCount !== 'number') errors.push('Missing or invalid "failedCount"');
            break;

        case EVENT_TYPES.DEVICE_STATUS:
            if (!payload.commandId) errors.push('Missing "commandId" for status response');
            if (!payload.status || typeof payload.status !== 'object') {
                errors.push('Missing or invalid "status" object');
            } else {
                // Validate status object structure
                const requiredFields = ['online', 'firmwareVersion', 'enrolledCount', 'capacity', 'doorStatus'];
                requiredFields.forEach(field => {
                    if (!(field in payload.status)) {
                        errors.push(`Missing "${field}" in status object`);
                    }
                });
            }
            break;

        case EVENT_TYPES.DEVICE_ERROR:
            if (!payload.error) errors.push('Missing "error" message');
            if (!payload.errorCode) errors.push('Missing "errorCode"');
            if (!payload.severity) errors.push('Missing "severity" level');
            break;

        default:
            errors.push(`Unknown event type: ${payload.type}`);
    }

    return { valid: errors.length === 0, errors };
}

// 6. Database Logging Function with Retry Logic
async function logToDatabase(eventData, retries = 3) {
    if (!BIOMETRIC_WEBHOOK_SECRET) {
        console.warn('⚠️  Skipping database logging - BIOMETRIC_WEBHOOK_SECRET not configured');
        return false;
    }

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

            console.log(`✅ Event logged to database: ${eventData.type} (Event ID: ${eventData.eventId})`);
            return true;

        } catch (error) {
            console.error(`❌ Database logging attempt ${attempt}/${retries} failed:`, error.message);
            
            if (attempt === retries) {
                console.error(`🚨 CRITICAL: Failed to log event after ${retries} attempts`, {
                    eventId: eventData.eventId,
                    type: eventData.type,
                    gymId: eventData.gymId
                });
                return false;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

// 7. Command Timeout Handler
function setCommandTimeout(gymId, commandId, socket) {
    if (!pendingCommands.has(gymId)) {
        pendingCommands.set(gymId, new Map());
    }

    const timeoutId = setTimeout(() => {
        console.warn(`⏱️  Command timeout: ${commandId} for gym ${gymId}`);
        
        socket.emit("command-timeout", {
            commandId,
            error: "Command timed out - bridge did not respond",
            code: ERROR_CODES.TIMEOUT
        });

        pendingCommands.get(gymId)?.delete(commandId);
    }, 30000); // 30 second timeout

    pendingCommands.get(gymId).set(commandId, {
        timestamp: Date.now(),
        timeoutId
    });
}

function clearCommandTimeout(gymId, commandId) {
    const gymCommands = pendingCommands.get(gymId);
    if (gymCommands?.has(commandId)) {
        clearTimeout(gymCommands.get(commandId).timeoutId);
        gymCommands.delete(commandId);
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

    // 1. ADMIN -> HARDWARE (Cloud Commands)
    socket.on("cloud-command", (payload) => {
        // Validate payload
        const validation = validateCloudCommand(payload);
        if (!validation.valid) {
            console.error(`[${gymId}] ❌ Invalid command payload:`, validation.errors);
            socket.emit("command-error", {
                commandId: payload?.commandId,
                errors: validation.errors,
                code: ERROR_CODES.INVALID_PAYLOAD
            });
            return;
        }

        // Check if bridge is online
        if (!onlineBridges.has(gymId)) {
            console.warn(`[${gymId}] ⚠️  Command sent but bridge is offline: ${payload.action}`);
            socket.emit("command-error", {
                commandId: payload.commandId,
                error: "Bridge is offline - command cannot be delivered",
                code: ERROR_CODES.BRIDGE_OFFLINE
            });
            return;
        }

        console.log(`[${gymId}] 📨 Command: ${payload.action} (ID: ${payload.commandId})`);

        // Set timeout for command response
        setCommandTimeout(gymId, payload.commandId, socket);

        // Add metadata
        const enrichedPayload = {
            ...payload,
            sentAt: new Date().toISOString(),
            gymId
        };

        // Broadcast to bridge only
        socket.to(roomName).emit("cloud-command", enrichedPayload);

        // Acknowledge command sent
        socket.emit("command-sent", {
            commandId: payload.commandId,
            action: payload.action,
            sentAt: enrichedPayload.sentAt
        });
    });

    // 2. HARDWARE -> ADMIN (Hardware Events with Database Logging)
    socket.on("hardware-event", async (payload) => {
        // Validate payload
        const validation = validateHardwareEvent(payload);
        if (!validation.valid) {
            console.error(`[${gymId}] ❌ Invalid hardware event:`, validation.errors);
            socket.emit("event-error", {
                eventId: payload?.eventId,
                errors: validation.errors,
                code: ERROR_CODES.INVALID_PAYLOAD
            });
            return;
        }

        console.log(`[${gymId}] 📡 Hardware Event: ${payload.type} (ID: ${payload.eventId})`);

        // Clear command timeout if this is a response to a command
        if (payload.commandId) {
            clearCommandTimeout(gymId, payload.commandId);
        }

        // Enrich event data
        const enrichedEvent = {
            ...payload,
            gymId,
            receivedAt: new Date().toISOString(),
            timestamp: payload.timestamp || new Date().toISOString()
        };

        // Log to database asynchronously
        logToDatabase(enrichedEvent).catch(err => {
            console.error(`[${gymId}] Database logging failed:`, err);
            // Notify admin of logging failure
            io.to(roomName).emit("system-warning", {
                message: "Event received but database logging failed",
                eventId: payload.eventId,
                code: ERROR_CODES.DATABASE_ERROR
            });
        });

        // Broadcast to Admin UI in the same room
        socket.to(roomName).emit("hardware-event", enrichedEvent);

        // Acknowledge event received
        socket.emit("event-received", {
            eventId: payload.eventId,
            receivedAt: enrichedEvent.receivedAt
        });
    });

    // 3. HEARTBEAT (Keep-alive mechanism)
    socket.on("heartbeat", () => {
        if (type === "BRIDGE" && onlineBridges.has(gymId)) {
            const bridgeInfo = onlineBridges.get(gymId);
            bridgeInfo.lastHeartbeat = Date.now();
            socket.emit("heartbeat-ack", { timestamp: Date.now() });
        }
    });

    // 4. DISCONNECT
    socket.on("disconnect", (reason) => {
        if (type === "BRIDGE") {
            console.log(`⚠️  BRIDGE Lost: ${gymId} (${reason})`);
            onlineBridges.delete(gymId);
            
            // Clear all pending commands for this gym
            const gymCommands = pendingCommands.get(gymId);
            if (gymCommands) {
                gymCommands.forEach((cmd, commandId) => {
                    clearTimeout(cmd.timeoutId);
                });
                pendingCommands.delete(gymId);
            }

            // Notify any listening Admins that bridge is offline
            io.to(roomName).emit("bridge-status", { 
                status: "OFFLINE",
                reason,
                timestamp: new Date().toISOString()
            });
        } else if (type === "ADMIN") {
            console.log(`👋 ADMIN disconnected from Gym: ${gymId}`);
        }
    });

    // 5. ERROR HANDLING
    socket.on("error", (error) => {
        console.error(`[${gymId}] Socket error:`, error);
    });
});

// Helper: Handle Bridge Specific Logic
function handleBridgeConnection(socket, gymId) {
    const connectedAt = Date.now();
    console.log(`✅ BRIDGE Online for Gym: ${gymId}`);
    
    onlineBridges.set(gymId, {
        socketId: socket.id,
        connectedAt,
        lastHeartbeat: connectedAt
    });

    // Notify Admins in the room
    io.to(`gym_${gymId}`).emit("bridge-status", { 
        status: "ONLINE",
        connectedAt: new Date(connectedAt).toISOString()
    });

    // Send initial sync request to bridge
    socket.emit("cloud-command", {
        action: COMMAND_TYPES.GET_DEVICE_STATUS,
        commandId: `status_${Date.now()}`,
        sentAt: new Date().toISOString()
    });
}

// Helper: Handle Admin Specific Logic
function handleAdminConnection(socket, gymId) {
    console.log(`👨‍💻 ADMIN viewing Dashboard for Gym: ${gymId}`);

    // Immediately tell Admin if the bridge is currently online
    const isOnline = onlineBridges.has(gymId);
    socket.emit("bridge-status", { status: isOnline ? "ONLINE" : "OFFLINE" });
}

// 8. Heartbeat Monitor (Check for stale connections)
setInterval(() => {
    const now = Date.now();
    const staleThreshold = 90000; // 90 seconds

    onlineBridges.forEach((bridgeInfo, gymId) => {
        if (now - bridgeInfo.lastHeartbeat > staleThreshold) {
            console.warn(`⚠️  Bridge ${gymId} appears stale (no heartbeat for ${Math.floor((now - bridgeInfo.lastHeartbeat) / 1000)}s)`);
            
            const socket = io.sockets.sockets.get(bridgeInfo.socketId);
            if (socket) {
                socket.disconnect(true);
            }
            onlineBridges.delete(gymId);
        }
    });
}, 30000); // Check every 30 seconds

// 9. Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    
    // Notify all connected clients
    io.emit('server-shutdown', { 
        message: 'Server is shutting down for maintenance',
        timestamp: new Date().toISOString()
    });

    // Close server
    httpServer.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
});

// 10. START SERVER
httpServer.listen(PORT, () => {
    console.log("==================================================");
    console.log(`🚀 REPSET SOCKET SERVER READY v3.0`);
    console.log(`👉 Listening on PORT: ${PORT}`);
    console.log(`🔐 Admin Secret: Configured`);
    console.log(`📊 Database Logging: ${BIOMETRIC_WEBHOOK_SECRET ? 'ENABLED ✅' : 'DISABLED ⚠️'}`);
    console.log(`🔗 Webhook URL: ${WEBHOOK_URL}`);
    console.log(`📋 Supported Commands: ${Object.keys(COMMAND_TYPES).length}`);
    console.log(`📡 Supported Events: ${Object.keys(EVENT_TYPES).length}`);
    console.log("==================================================");
});
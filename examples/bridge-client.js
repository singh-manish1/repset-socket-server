/**
 * Example Bridge Client Implementation
 * For Raspberry Pi or hardware device running biometric sensor
 */

import { io } from "socket.io-client";

class BiometricBridge {
  constructor(config) {
    this.gymId = config.gymId;
    this.secret = config.secret;
    this.serverUrl = config.serverUrl;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  connect() {
    this.socket = io(this.serverUrl, {
      auth: {
        gymId: this.gymId,
        secret: this.secret,
        type: "BRIDGE"
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Connection events
    this.socket.on("connect", () => {
      console.log("✅ Connected to server");
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`⚠️  Disconnected: ${reason}`);
      this.stopHeartbeat();
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Connection error:", error.message);
      this.reconnectAttempts++;
    });

    // Command from platform
    this.socket.on("cloud-command", async (command) => {
      console.log(`📨 Received command: ${command.action}`);
      await this.handleCommand(command);
    });

    // Bridge status updates
    this.socket.on("bridge-status", (status) => {
      console.log(`📡 Bridge status: ${status.status}`);
    });

    // Server shutdown notification
    this.socket.on("server-shutdown", (data) => {
      console.log(`🛑 Server shutting down: ${data.message}`);
    });
  }

  async handleCommand(command) {
    try {
      switch (command.action) {
        case "ENROLL_FINGERPRINT":
          await this.enrollFingerprint(command);
          break;
        
        case "DELETE_FINGERPRINT":
          await this.deleteFingerprint(command);
          break;
        
        case "VERIFY_FINGERPRINT":
          await this.verifyFingerprint(command);
          break;
        
        case "UNLOCK_DOOR":
          await this.unlockDoor(command);
          break;
        
        case "LOCK_DOOR":
          await this.lockDoor(command);
          break;
        
        case "SYNC_USERS":
          await this.syncUsers(command);
          break;
        
        case "GET_DEVICE_STATUS":
          await this.getDeviceStatus(command);
          break;
        
        case "REBOOT_DEVICE":
          await this.rebootDevice(command);
          break;
        
        case "CLEAR_ALL_FINGERPRINTS":
          await this.clearAllFingerprints(command);
          break;
        
        default:
          this.sendEvent({
            type: "DEVICE_ERROR",
            eventId: this.generateEventId(),
            error: `Unknown command: ${command.action}`,
            errorCode: "UNKNOWN_COMMAND",
            timestamp: new Date().toISOString()
          });
      }
    } catch (error) {
      console.error(`Error handling command ${command.action}:`, error);
      this.sendEvent({
        type: "DEVICE_ERROR",
        eventId: this.generateEventId(),
        commandId: command.commandId,
        error: error.message,
        errorCode: "COMMAND_EXECUTION_ERROR",
        timestamp: new Date().toISOString()
      });
    }
  }

  async enrollFingerprint(command) {
    console.log(`👆 Starting enrollment for user ${command.userId}...`);
    
    // Simulate fingerprint enrollment process
    // In real implementation, interface with biometric sensor
    await this.simulateDelay(2000);
    
    // Simulate success (90% success rate)
    if (Math.random() > 0.1) {
      this.sendEvent({
        type: "ENROLLMENT_SUCCESS",
        eventId: this.generateEventId(),
        commandId: command.commandId,
        userId: command.userId,
        fingerprintId: command.fingerprintId || Math.floor(Math.random() * 1000),
        timestamp: new Date().toISOString()
      });
    } else {
      this.sendEvent({
        type: "ENROLLMENT_FAILED",
        eventId: this.generateEventId(),
        commandId: command.commandId,
        userId: command.userId,
        error: "Fingerprint quality too low",
        errorCode: "QUALITY_ERROR",
        timestamp: new Date().toISOString()
      });
    }
  }

  async deleteFingerprint(command) {
    console.log(`🗑️  Deleting fingerprint...`);
    await this.simulateDelay(500);
    
    this.sendEvent({
      type: "DELETION_SUCCESS",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      userId: command.userId,
      fingerprintId: command.fingerprintId,
      timestamp: new Date().toISOString()
    });
  }

  async verifyFingerprint(command) {
    console.log(`🔍 Verifying fingerprint for user ${command.userId}...`);
    await this.simulateDelay(1000);
    
    this.sendEvent({
      type: "VERIFICATION_SUCCESS",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      userId: command.userId,
      matchScore: 95,
      timestamp: new Date().toISOString()
    });
  }

  async unlockDoor(command) {
    console.log(`🔓 Unlocking door...`);
    // Interface with door lock hardware
    await this.simulateDelay(300);
    
    this.sendEvent({
      type: "DOOR_UNLOCKED",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      timestamp: new Date().toISOString()
    });

    // Auto-lock after duration
    if (command.duration) {
      setTimeout(() => this.lockDoor({ commandId: "auto_lock" }), command.duration);
    }
  }

  async lockDoor(command) {
    console.log(`🔒 Locking door...`);
    await this.simulateDelay(300);
    
    this.sendEvent({
      type: "DOOR_LOCKED",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      timestamp: new Date().toISOString()
    });
  }

  async syncUsers(command) {
    console.log(`🔄 Syncing ${command.users.length} users...`);
    await this.simulateDelay(1000);
    
    this.sendEvent({
      type: "SYNC_COMPLETE",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      syncedCount: command.users.length,
      failedCount: 0,
      timestamp: new Date().toISOString()
    });
  }

  async getDeviceStatus(command) {
    this.sendEvent({
      type: "DEVICE_STATUS",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      status: {
        online: true,
        firmwareVersion: "2.1.5",
        enrolledCount: 45,
        capacity: 1000,
        lastReboot: new Date(Date.now() - 86400000).toISOString(),
        doorStatus: "LOCKED",
        batteryLevel: 85
      },
      timestamp: new Date().toISOString()
    });
  }

  async rebootDevice(command) {
    console.log(`🔄 Rebooting device...`);
    this.sendEvent({
      type: "DEVICE_STATUS",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      status: { rebooting: true },
      timestamp: new Date().toISOString()
    });
    
    // Simulate reboot
    setTimeout(() => {
      this.socket.disconnect();
      setTimeout(() => this.connect(), 5000);
    }, 2000);
  }

  async clearAllFingerprints(command) {
    console.log(`🗑️  Clearing all fingerprints...`);
    await this.simulateDelay(1000);
    
    this.sendEvent({
      type: "DELETION_SUCCESS",
      eventId: this.generateEventId(),
      commandId: command.commandId,
      clearedCount: 45,
      timestamp: new Date().toISOString()
    });
  }

  // Simulate attendance scan
  simulateAttendanceScan(userId) {
    this.sendEvent({
      type: "ATTENDANCE",
      eventId: this.generateEventId(),
      userId: userId,
      fingerprintId: Math.floor(Math.random() * 1000),
      matchScore: 95 + Math.floor(Math.random() * 5),
      timestamp: new Date().toISOString()
    });
  }

  sendEvent(event) {
    if (!this.socket || !this.socket.connected) {
      console.error("❌ Cannot send event - not connected");
      return;
    }
    
    console.log(`📤 Sending event: ${event.type}`);
    this.socket.emit("hardware-event", event);
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit("heartbeat");
      }
    }, 30000); // Every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  simulateDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Usage Example
const bridge = new BiometricBridge({
  gymId: "gym_123",
  secret: process.env.ADMIN_SECRET,
  serverUrl: "https://your-server.com"
});

bridge.connect();

// Simulate attendance scans every 10 seconds
setInterval(() => {
  const randomUserId = 100 + Math.floor(Math.random() * 50);
  bridge.simulateAttendanceScan(randomUserId);
}, 10000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down bridge...');
  bridge.disconnect();
  process.exit(0);
});

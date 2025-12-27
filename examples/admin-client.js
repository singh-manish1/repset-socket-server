/**
 * Example Admin Dashboard Client Implementation
 * For Next.js/React admin interface
 */

import { io } from "socket.io-client";

class AdminDashboardClient {
  constructor(config) {
    this.gymId = config.gymId;
    this.secret = config.secret;
    this.serverUrl = config.serverUrl;
    this.socket = null;
    this.eventHandlers = new Map();
    this.pendingCommands = new Map();
  }

  connect() {
    this.socket = io(this.serverUrl, {
      auth: {
        gymId: this.gymId,
        secret: this.secret,
        type: "ADMIN"
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Connection events
    this.socket.on("connect", () => {
      console.log("✅ Connected to server");
      this.emit("connection", { status: "connected" });
    });

    this.socket.on("disconnect", (reason) => {
      console.log(`⚠️  Disconnected: ${reason}`);
      this.emit("connection", { status: "disconnected", reason });
    });

    // Bridge status
    this.socket.on("bridge-status", (status) => {
      console.log(`📡 Bridge status: ${status.status}`);
      this.emit("bridge-status", status);
    });

    // Hardware events from bridge
    this.socket.on("hardware-event", (event) => {
      console.log(`📡 Hardware event: ${event.type}`);
      this.emit("hardware-event", event);
      
      // Resolve pending command if this is a response
      if (event.commandId && this.pendingCommands.has(event.commandId)) {
        const { resolve } = this.pendingCommands.get(event.commandId);
        resolve(event);
        this.pendingCommands.delete(event.commandId);
      }
    });

    // Command acknowledgments
    this.socket.on("command-sent", (data) => {
      console.log(`✅ Command sent: ${data.commandId}`);
      this.emit("command-sent", data);
    });

    this.socket.on("command-error", (error) => {
      console.error(`❌ Command error:`, error);
      this.emit("command-error", error);
      
      // Reject pending command
      if (error.commandId && this.pendingCommands.has(error.commandId)) {
        const { reject } = this.pendingCommands.get(error.commandId);
        reject(new Error(error.error || error.errors?.join(", ")));
        this.pendingCommands.delete(error.commandId);
      }
    });

    this.socket.on("command-timeout", (data) => {
      console.error(`⏱️  Command timeout: ${data.commandId}`);
      this.emit("command-timeout", data);
      
      // Reject pending command
      if (this.pendingCommands.has(data.commandId)) {
        const { reject } = this.pendingCommands.get(data.commandId);
        reject(new Error("Command timeout"));
        this.pendingCommands.delete(data.commandId);
      }
    });

    // Event acknowledgments
    this.socket.on("event-received", (data) => {
      console.log(`✅ Event received: ${data.eventId}`);
    });

    // System warnings
    this.socket.on("system-warning", (warning) => {
      console.warn(`⚠️  System warning:`, warning);
      this.emit("system-warning", warning);
    });

    // Server shutdown
    this.socket.on("server-shutdown", (data) => {
      console.log(`🛑 Server shutting down: ${data.message}`);
      this.emit("server-shutdown", data);
    });
  }

  // Event emitter pattern for React components
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
    
    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  // Command methods with Promise-based API
  async enrollFingerprint(userId, fingerprintId = null) {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "ENROLL_FINGERPRINT",
      commandId,
      userId,
      ...(fingerprintId && { fingerprintId })
    });
  }

  async deleteFingerprint(userId, fingerprintId = null) {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "DELETE_FINGERPRINT",
      commandId,
      ...(userId && { userId }),
      ...(fingerprintId && { fingerprintId })
    });
  }

  async verifyFingerprint(userId) {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "VERIFY_FINGERPRINT",
      commandId,
      userId
    });
  }

  async unlockDoor(duration = null) {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "UNLOCK_DOOR",
      commandId,
      ...(duration && { duration })
    });
  }

  async lockDoor() {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "LOCK_DOOR",
      commandId
    });
  }

  async syncUsers(users) {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "SYNC_USERS",
      commandId,
      users
    });
  }

  async getDeviceStatus() {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "GET_DEVICE_STATUS",
      commandId
    });
  }

  async rebootDevice() {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "REBOOT_DEVICE",
      commandId
    });
  }

  async clearAllFingerprints() {
    const commandId = this.generateCommandId();
    
    return this.sendCommand({
      action: "CLEAR_ALL_FINGERPRINTS",
      commandId
    });
  }

  sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error("Not connected to server"));
        return;
      }

      // Store promise handlers
      this.pendingCommands.set(command.commandId, { resolve, reject });

      // Set timeout (35 seconds - slightly longer than server timeout)
      setTimeout(() => {
        if (this.pendingCommands.has(command.commandId)) {
          this.pendingCommands.delete(command.commandId);
          reject(new Error("Command timeout"));
        }
      }, 35000);

      // Send command
      this.socket.emit("cloud-command", command);
    });
  }

  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.eventHandlers.clear();
    this.pendingCommands.clear();
  }
}

// React Hook Example
export function useAdminSocket(gymId) {
  const [client, setClient] = React.useState(null);
  const [bridgeStatus, setBridgeStatus] = React.useState("OFFLINE");
  const [events, setEvents] = React.useState([]);

  React.useEffect(() => {
    const adminClient = new AdminDashboardClient({
      gymId,
      secret: process.env.NEXT_PUBLIC_ADMIN_SECRET,
      serverUrl: process.env.NEXT_PUBLIC_SOCKET_URL
    });

    adminClient.connect();

    // Subscribe to events
    const unsubscribeBridge = adminClient.on("bridge-status", (status) => {
      setBridgeStatus(status.status);
    });

    const unsubscribeEvents = adminClient.on("hardware-event", (event) => {
      setEvents(prev => [event, ...prev].slice(0, 100)); // Keep last 100 events
    });

    setClient(adminClient);

    // Cleanup
    return () => {
      unsubscribeBridge();
      unsubscribeEvents();
      adminClient.disconnect();
    };
  }, [gymId]);

  return {
    client,
    bridgeStatus,
    events,
    enrollFingerprint: (userId, fingerprintId) => 
      client?.enrollFingerprint(userId, fingerprintId),
    deleteFingerprint: (userId, fingerprintId) => 
      client?.deleteFingerprint(userId, fingerprintId),
    unlockDoor: (duration) => 
      client?.unlockDoor(duration),
    lockDoor: () => 
      client?.lockDoor(),
    getDeviceStatus: () => 
      client?.getDeviceStatus()
  };
}

// Usage in React Component
export default function BiometricDashboard({ gymId }) {
  const { 
    client, 
    bridgeStatus, 
    events, 
    enrollFingerprint,
    unlockDoor 
  } = useAdminSocket(gymId);

  const handleEnroll = async (userId) => {
    try {
      const result = await enrollFingerprint(userId);
      console.log("Enrollment successful:", result);
      alert(`Fingerprint enrolled for user ${userId}`);
    } catch (error) {
      console.error("Enrollment failed:", error);
      alert(`Enrollment failed: ${error.message}`);
    }
  };

  const handleUnlock = async () => {
    try {
      await unlockDoor(5000); // Auto-lock after 5 seconds
      alert("Door unlocked");
    } catch (error) {
      alert(`Failed to unlock: ${error.message}`);
    }
  };

  return (
    <div>
      <h1>Biometric Dashboard</h1>
      <div>Bridge Status: {bridgeStatus}</div>
      
      <button onClick={() => handleEnroll(101)}>
        Enroll User 101
      </button>
      
      <button onClick={handleUnlock}>
        Unlock Door
      </button>

      <h2>Recent Events</h2>
      <ul>
        {events.map(event => (
          <li key={event.eventId}>
            {event.type} - User {event.userId} - {event.timestamp}
          </li>
        ))}
      </ul>
    </div>
  );
}

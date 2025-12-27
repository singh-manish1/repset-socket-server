# Repset Socket Server API Documentation v3.0

## Overview
Production-ready WebSocket server for biometric device communication between gym hardware (bridges) and admin dashboards.

---

## Connection & Authentication

### Socket.IO Connection
```javascript
const socket = io("https://your-server.com", {
  auth: {
    gymId: "gym_123",
    secret: "your_admin_secret",
    type: "BRIDGE" // or "ADMIN"
  }
});
```

**Auth Parameters:**
- `gymId` (required): Unique gym identifier
- `secret` (required): Must match `ADMIN_SECRET` from server
- `type` (required): Either `"BRIDGE"` or `"ADMIN"`

---

## Commands (Platform → Bridge)

### Event: `cloud-command`

All commands require:
- `action` (string): Command type from COMMAND_TYPES
- `commandId` (string): Unique identifier for tracking
- Additional fields based on command type

### 1. Enroll Fingerprint
```javascript
socket.emit("cloud-command", {
  action: "ENROLL_FINGERPRINT",
  commandId: "enroll_12345",
  userId: 101,
  fingerprintId: 5  // Optional: specific slot on device
});
```

**Expected Response:**
```javascript
// Success
{
  type: "ENROLLMENT_SUCCESS",
  eventId: "evt_67890",
  commandId: "enroll_12345",
  userId: 101,
  fingerprintId: 5,
  timestamp: "2025-12-28T10:30:00Z"
}

// Failure
{
  type: "ENROLLMENT_FAILED",
  eventId: "evt_67891",
  commandId: "enroll_12345",
  userId: 101,
  error: "Fingerprint quality too low",
  errorCode: "QUALITY_ERROR",
  timestamp: "2025-12-28T10:30:00Z"
}
```

### 2. Delete Fingerprint
```javascript
socket.emit("cloud-command", {
  action: "DELETE_FINGERPRINT",
  commandId: "delete_12346",
  userId: 101,           // Delete all fingerprints for user
  // OR
  fingerprintId: 5       // Delete specific fingerprint slot
});
```

**Expected Response:**
```javascript
// Success
{
  type: "DELETION_SUCCESS",
  eventId: "evt_67892",
  commandId: "delete_12346",
  userId: 101,
  fingerprintId: 5,
  timestamp: "2025-12-28T10:31:00Z"
}

// Failure
{
  type: "DELETION_FAILED",
  eventId: "evt_67893",
  commandId: "delete_12346",
  error: "Fingerprint not found",
  errorCode: "NOT_FOUND",
  timestamp: "2025-12-28T10:31:00Z"
}
```

### 3. Verify Fingerprint
```javascript
socket.emit("cloud-command", {
  action: "VERIFY_FINGERPRINT",
  commandId: "verify_12347",
  userId: 101
});
```

**Expected Response:**
```javascript
// Success
{
  type: "VERIFICATION_SUCCESS",
  eventId: "evt_67894",
  commandId: "verify_12347",
  userId: 101,
  matchScore: 95,
  timestamp: "2025-12-28T10:32:00Z"
}

// Failure
{
  type: "VERIFICATION_FAILED",
  eventId: "evt_67895",
  commandId: "verify_12347",
  error: "No match found",
  errorCode: "NO_MATCH",
  timestamp: "2025-12-28T10:32:00Z"
}
```

### 4. Unlock/Lock Door
```javascript
socket.emit("cloud-command", {
  action: "UNLOCK_DOOR",  // or "LOCK_DOOR"
  commandId: "door_12348",
  duration: 5000  // Optional: auto-lock after 5 seconds
});
```

**Expected Response:**
```javascript
{
  type: "DOOR_UNLOCKED",  // or "DOOR_LOCKED"
  eventId: "evt_67896",
  commandId: "door_12348",
  timestamp: "2025-12-28T10:33:00Z"
}
```

### 5. Sync Users
```javascript
socket.emit("cloud-command", {
  action: "SYNC_USERS",
  commandId: "sync_12349",
  users: [
    { userId: 101, name: "John Doe", accessLevel: "member" },
    { userId: 102, name: "Jane Smith", accessLevel: "admin" }
  ]
});
```

**Expected Response:**
```javascript
{
  type: "SYNC_COMPLETE",
  eventId: "evt_67897",
  commandId: "sync_12349",
  syncedCount: 2,
  failedCount: 0,
  timestamp: "2025-12-28T10:34:00Z"
}
```

### 6. Get Device Status
```javascript
socket.emit("cloud-command", {
  action: "GET_DEVICE_STATUS",
  commandId: "status_12350"
});
```

**Expected Response:**
```javascript
{
  type: "DEVICE_STATUS",
  eventId: "evt_67898",
  commandId: "status_12350",
  status: {
    online: true,
    firmwareVersion: "2.1.5",
    enrolledCount: 45,
    capacity: 1000,
    lastReboot: "2025-12-27T08:00:00Z",
    doorStatus: "LOCKED",
    batteryLevel: 85  // If applicable
  },
  timestamp: "2025-12-28T10:35:00Z"
}
```

### 7. Reboot Device
```javascript
socket.emit("cloud-command", {
  action: "REBOOT_DEVICE",
  commandId: "reboot_12351"
});
```

### 8. Clear All Fingerprints
```javascript
socket.emit("cloud-command", {
  action: "CLEAR_ALL_FINGERPRINTS",
  commandId: "clear_12352"
});
```

---

## Events (Bridge → Platform)

### Event: `hardware-event`

All events require:
- `type` (string): Event type from EVENT_TYPES
- `eventId` (string): Unique identifier
- `timestamp` (string): ISO 8601 timestamp
- Additional fields based on event type

### 1. Attendance (Fingerprint Scan)
```javascript
socket.emit("hardware-event", {
  type: "ATTENDANCE",
  eventId: "evt_67899",
  userId: 101,
  fingerprintId: 5,
  matchScore: 98,
  timestamp: "2025-12-28T10:36:00Z"
});
```

### 2. Unauthorized Access Attempt
```javascript
socket.emit("hardware-event", {
  type: "UNAUTHORIZED_ACCESS",
  eventId: "evt_67900",
  userId: null,  // Unknown user
  fingerprintId: null,
  attemptCount: 3,
  timestamp: "2025-12-28T10:37:00Z"
});
```

### 3. Device Error
```javascript
socket.emit("hardware-event", {
  type: "DEVICE_ERROR",
  eventId: "evt_67901",
  error: "Sensor malfunction detected",
  errorCode: "SENSOR_ERROR",
  severity: "HIGH",  // LOW, MEDIUM, HIGH, CRITICAL
  timestamp: "2025-12-28T10:38:00Z"
});
```

---

## Server Responses

### Command Acknowledgment
```javascript
// Sent immediately when command is received
socket.on("command-sent", (data) => {
  // data: { commandId, action, sentAt }
});
```

### Command Error
```javascript
socket.on("command-error", (data) => {
  // data: { commandId, error, errors, code }
});
```

### Command Timeout
```javascript
socket.on("command-timeout", (data) => {
  // data: { commandId, error, code: "TIMEOUT" }
  // Triggered after 30 seconds with no response
});
```

### Event Acknowledgment
```javascript
socket.on("event-received", (data) => {
  // data: { eventId, receivedAt }
});
```

### Event Error
```javascript
socket.on("event-error", (data) => {
  // data: { eventId, errors, code }
});
```

### Bridge Status
```javascript
socket.on("bridge-status", (data) => {
  // data: { status: "ONLINE" | "OFFLINE", connectedAt?, reason?, timestamp }
});
```

### System Warning
```javascript
socket.on("system-warning", (data) => {
  // data: { message, eventId?, code }
});
```

---

## Heartbeat Mechanism

### Bridge Heartbeat
```javascript
// Send every 30 seconds
setInterval(() => {
  socket.emit("heartbeat");
}, 30000);

socket.on("heartbeat-ack", (data) => {
  // data: { timestamp }
});
```

**Note:** Bridges that don't send heartbeat for 90 seconds will be disconnected.

---

## Error Codes

```javascript
ERROR_CODES = {
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_COMMAND: "INVALID_COMMAND",
  BRIDGE_OFFLINE: "BRIDGE_OFFLINE",
  DATABASE_ERROR: "DATABASE_ERROR",
  TIMEOUT: "TIMEOUT",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED"
}
```

---

## Data Flow Examples

### Complete Enrollment Flow

1. **Admin initiates enrollment:**
```javascript
socket.emit("cloud-command", {
  action: "ENROLL_FINGERPRINT",
  commandId: "enroll_001",
  userId: 101
});
```

2. **Server acknowledges:**
```javascript
socket.on("command-sent", { 
  commandId: "enroll_001", 
  action: "ENROLL_FINGERPRINT",
  sentAt: "2025-12-28T10:00:00Z"
});
```

3. **Bridge receives command** (via `cloud-command` event)

4. **User places finger on sensor** (bridge handles locally)

5. **Bridge sends result:**
```javascript
socket.emit("hardware-event", {
  type: "ENROLLMENT_SUCCESS",
  eventId: "evt_001",
  commandId: "enroll_001",
  userId: 101,
  fingerprintId: 5,
  timestamp: "2025-12-28T10:00:15Z"
});
```

6. **Server logs to database** (automatic)

7. **Admin receives event** (via `hardware-event` broadcast)

8. **Server acknowledges event:**
```javascript
socket.on("event-received", {
  eventId: "evt_001",
  receivedAt: "2025-12-28T10:00:15.123Z"
});
```

---

## Database Webhook Format

Events are automatically sent to the configured webhook URL:

```javascript
POST /api/webhooks/biometric-events
Content-Type: application/json

{
  "type": "ATTENDANCE",
  "eventId": "evt_67899",
  "userId": 101,
  "gymId": "gym_123",
  "timestamp": "2025-12-28T10:36:00Z",
  "receivedAt": "2025-12-28T10:36:00.456Z",
  "secret": "your_biometric_webhook_secret",
  // ... additional event-specific fields
}
```

---

## Best Practices

### For Bridge Implementations:
1. Always include `eventId` and `commandId` for tracking
2. Send heartbeat every 30 seconds
3. Respond to commands within 30 seconds
4. Include detailed error messages in failure events
5. Use ISO 8601 timestamps

### For Admin Implementations:
1. Generate unique `commandId` for each command
2. Listen for `command-error` and `command-timeout` events
3. Handle `bridge-status` to show connection state
4. Implement retry logic for failed commands
5. Display user-friendly error messages

### For Both:
1. Implement reconnection logic with exponential backoff
2. Validate all payloads before sending
3. Log all events for debugging
4. Handle network interruptions gracefully
5. Use secure connections (WSS) in production

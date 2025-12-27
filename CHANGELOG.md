# Changelog

All notable changes to the Repset Socket Server will be documented in this file.

## [3.0.0] - 2025-12-28

### Added - Production-Ready Features

#### Comprehensive Biometric Support
- **9 Command Types**: Full support for fingerprint enrollment, deletion, verification, door control, user sync, device management
- **13 Event Types**: Complete event coverage including attendance, enrollment results, device errors, and status updates
- **Command-Response Tracking**: Automatic linking of commands to their responses via `commandId`

#### Validation & Error Handling
- **Input Validation**: Comprehensive validation for all commands and events
- **Command-Specific Validation**: Each command type has tailored validation rules
- **Error Codes**: 7 standardized error codes for consistent error handling
- **Validation Feedback**: Detailed error messages with field-level validation

#### Reliability Features
- **Command Timeout**: 30-second timeout for all commands with automatic cleanup
- **Heartbeat Mechanism**: 30-second heartbeat requirement with 90-second stale detection
- **Pending Command Tracking**: In-memory tracking of all pending commands
- **Automatic Cleanup**: Cleanup of pending commands on disconnect

#### Enhanced Monitoring
- **Connection Metadata**: Track connection time and last heartbeat for each bridge
- **Stale Connection Detection**: Automatic detection and cleanup of stale connections
- **Enhanced Logging**: Detailed logging with event IDs and command IDs
- **Bridge Status Updates**: Real-time bridge status with timestamps and reasons

#### Database Integration
- **Retry Logic**: 3 retry attempts with exponential backoff for webhook calls
- **Non-Blocking**: Database logging doesn't block real-time event delivery
- **Error Notifications**: Admins notified of database logging failures
- **Conditional Logging**: Graceful handling when webhook is not configured

#### Developer Experience
- **Complete API Documentation**: 200+ lines of comprehensive API docs
- **Example Implementations**: Full bridge and admin client examples
- **React Hook Example**: Ready-to-use React hook for admin dashboards
- **TypeScript-Ready**: All event types and constants documented

#### Production Features
- **Graceful Shutdown**: SIGTERM handling with client notification
- **Health Check Endpoint**: HTTP endpoint for monitoring
- **Command Acknowledgments**: Immediate acknowledgment of sent commands
- **Event Acknowledgments**: Confirmation of received events
- **System Warnings**: Non-critical warnings sent to admins

### Changed

#### Breaking Changes
- **Event Structure**: All events now require `eventId` field
- **Command Structure**: All commands now require `commandId` field
- **Bridge Tracking**: Changed from simple socketId to metadata object
- **Status Events**: Enhanced with additional metadata (timestamps, reasons)

#### Improvements
- **Error Messages**: More descriptive and actionable error messages
- **Logging Format**: Consistent logging format with event/command IDs
- **Disconnect Handling**: Enhanced disconnect handling with cleanup
- **Connection Flow**: Improved connection flow with initial status sync

### Fixed
- **Memory Leaks**: Proper cleanup of pending commands and timeouts
- **Stale Connections**: Automatic detection and cleanup of dead connections
- **Error Propagation**: Proper error propagation to clients
- **Timeout Handling**: Consistent timeout handling across all commands

---

## [2.0.0] - Previous Version

### Added
- Database logging with webhook integration
- Basic command and event handling
- Room-based isolation per gym
- Simple bridge/admin connection tracking

### Features
- Basic attendance tracking
- Simple door unlock commands
- Database webhook with retry logic

---

## [1.0.0] - Initial Release

### Added
- Basic WebSocket server
- Socket.IO integration
- Simple authentication
- Basic event broadcasting

---

## Migration Guide: v2.0 → v3.0

### For Bridge Implementations

1. **Add eventId to all events:**
```javascript
// Before
socket.emit("hardware-event", {
  type: "ATTENDANCE",
  userId: 101
});

// After
socket.emit("hardware-event", {
  type: "ATTENDANCE",
  eventId: generateEventId(),
  userId: 101,
  timestamp: new Date().toISOString()
});
```

2. **Add commandId to command responses:**
```javascript
// Before
socket.emit("hardware-event", {
  type: "ENROLLMENT_SUCCESS",
  userId: 101
});

// After
socket.emit("hardware-event", {
  type: "ENROLLMENT_SUCCESS",
  eventId: generateEventId(),
  commandId: command.commandId,  // Link to original command
  userId: 101,
  fingerprintId: 5,
  timestamp: new Date().toISOString()
});
```

3. **Implement heartbeat:**
```javascript
setInterval(() => {
  socket.emit("heartbeat");
}, 30000);
```

### For Admin Implementations

1. **Add commandId to all commands:**
```javascript
// Before
socket.emit("cloud-command", {
  action: "ENROLL_FINGERPRINT",
  userId: 101
});

// After
socket.emit("cloud-command", {
  action: "ENROLL_FINGERPRINT",
  commandId: generateCommandId(),
  userId: 101
});
```

2. **Listen for new acknowledgment events:**
```javascript
socket.on("command-sent", (data) => {
  console.log("Command sent:", data.commandId);
});

socket.on("command-error", (error) => {
  console.error("Command failed:", error);
});

socket.on("command-timeout", (data) => {
  console.error("Command timeout:", data.commandId);
});
```

3. **Handle enhanced bridge status:**
```javascript
socket.on("bridge-status", (status) => {
  // status now includes: status, connectedAt, reason, timestamp
  console.log("Bridge status:", status);
});
```

### Breaking Changes Summary

| Change | Impact | Action Required |
|--------|--------|-----------------|
| `eventId` required | All hardware events | Add unique ID to all events |
| `commandId` required | All commands | Add unique ID to all commands |
| Command responses need `commandId` | Bridge implementations | Link responses to commands |
| Heartbeat required | Bridge implementations | Send heartbeat every 30s |
| Enhanced status structure | Admin implementations | Update status handling |

---

## Roadmap

### v3.1.0 (Planned)
- [ ] Rate limiting per gym
- [ ] Command queue for offline bridges
- [ ] Metrics and analytics endpoint
- [ ] WebSocket compression

### v3.2.0 (Planned)
- [ ] Multi-region support
- [ ] Redis adapter for horizontal scaling
- [ ] Advanced monitoring dashboard
- [ ] Automated testing suite

### v4.0.0 (Future)
- [ ] GraphQL subscriptions support
- [ ] gRPC support for bridges
- [ ] Built-in database (optional)
- [ ] Admin API for management

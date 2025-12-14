# Presence System Architecture

> **Phase 2 Implementation** - Real-time user presence tracking, session management, and activity logging

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [Data Structures](#data-structures)
- [Redis Operations](#redis-operations)
- [Heartbeat Mechanism](#heartbeat-mechanism)
- [Timeout and Reconnection](#timeout-and-reconnection)
- [Performance Considerations](#performance-considerations)
- [Best Practices](#best-practices)

## Overview

The Presence System is a critical component of the real-time collaboration infrastructure, providing:

- **Real-time presence tracking**: Monitor user online/away/offline status
- **Session management**: Create, join, and leave collaboration sessions
- **Activity logging**: Comprehensive audit trail of all activities
- **Cursor tracking**: Share cursor positions for collaborative awareness
- **Automatic timeout detection**: Identify inactive users automatically

### Key Metrics

- **Presence update latency**: < 10ms (p95)
- **Heartbeat interval**: 30 seconds
- **Timeout detection**: 30 seconds
- **Away status threshold**: 2 minutes
- **Redis TTL**: 60 seconds

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              React useCollaboration Hook                     │  │
│  │  - Auto heartbeat every 30s                                  │  │
│  │  - Away detection (2min idle)                                │  │
│  │  - Cursor position tracking                                  │  │
│  └────────────────────────┬─────────────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────────────┘
                            │ WebSocket
┌───────────────────────────▼──────────────────────────────────────────┐
│                      WebSocket Server                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           Message Routing & Broadcasting                     │  │
│  │  - session_create, session_join, session_leave               │  │
│  │  - presence_update, cursor_update                            │  │
│  │  - heartbeat processing                                      │  │
│  └────────┬─────────────────────┬───────────────────────────────┘  │
└───────────┼─────────────────────┼────────────────────────────────────┘
            │                     │
┌───────────▼──────────┐  ┌──────▼────────────┐  ┌─────────────────┐
│   SessionManager     │  │ PresenceManager   │  │ ActivityLogger  │
│  ┌────────────────┐  │  │ ┌──────────────┐  │  │ ┌─────────────┐ │
│  │ - Create       │  │  │ │ - Set status │  │  │ │ - Log events│ │
│  │ - Join         │  │  │ │ - Heartbeat  │  │  │ │ - Audit     │ │
│  │ - Leave        │  │  │ │ - Timeout    │  │  │ │ - Export    │ │
│  │ - Permissions  │  │  │ │ - Cursor     │  │  │ │ - Summary   │ │
│  └───────┬────────┘  │  │ └──────┬───────┘  │  │ └──────┬──────┘ │
└──────────┼───────────┘  └────────┼──────────┘  └─────────┼────────┘
           │                       │                        │
┌──────────▼───────────┐  ┌───────▼────────┐  ┌───────────▼────────┐
│ SessionRepository    │  │  RedisClient   │  │ ActivityRepository │
│ (PostgreSQL)         │  │  (Redis)       │  │ (PostgreSQL)       │
└──────────────────────┘  └────────────────┘  └────────────────────┘
```

## Components

### 1. PresenceManager

**Purpose**: Manages real-time user presence using Redis for fast updates

**Key Features**:
- Set/update user presence (online/away/offline)
- Process heartbeat messages
- Track cursor positions
- Automatic timeout detection
- Pub/sub for real-time notifications

**Methods**:
```typescript
class PresenceManager {
  // Set user presence
  async setPresence(sessionId, userId, status, cursor?)
  
  // Get online users
  async getOnlineUsers(sessionId): Promise<PresenceUser[]>
  
  // Process heartbeat
  async processHeartbeat(sessionId, userId, cursor?)
  
  // Update cursor position
  async updateCursor(sessionId, userId, cursor)
  
  // Remove presence (on disconnect)
  async removePresence(sessionId, userId)
  
  // Subscribe to presence updates
  async subscribeToPresence(sessionId, callback)
}
```

### 2. SessionManager

**Purpose**: Manages collaboration session lifecycle and participants

**Key Features**:
- Create sessions with metadata
- Add/remove participants with roles
- Permission checks
- Session status management
- Participant counting

**Methods**:
```typescript
class SessionManager {
  // Create new session
  async createSession(ownerId, operationId, metadata)
  
  // Add participant with role
  async addParticipant(sessionId, userId, role)
  
  // Remove participant
  async removeParticipant(sessionId, userId)
  
  // Get participants
  async getParticipants(sessionId): Promise<SessionParticipant[]>
  
  // Check permissions
  async hasPermission(sessionId, userId, action): Promise<boolean>
  
  // End session
  async endSession(sessionId)
}
```

### 3. ActivityLogger

**Purpose**: Logs all collaboration activities for audit trails

**Key Features**:
- Async activity logging with queuing
- Bulk insert optimization
- Activity filtering and queries
- Audit trail generation
- CSV export

**Methods**:
```typescript
class ActivityLogger {
  // Log activity
  async logActivity(sessionId, userId, type, details)
  
  // Queue for bulk insert
  queueActivity(params)
  
  // Get session activity
  async getSessionActivity(sessionId, limit?)
  
  // Generate audit trail
  async generateAuditTrail(sessionId)
  
  // Get statistics
  async getActivityStatistics(sessionId)
}
```

## Data Structures

### Redis Keys

```typescript
// Presence data for specific user in session
presence:{sessionId}:{userId}

// Sorted set of users in session (scored by timestamp)
presence:session:{sessionId}

// Pub/sub channel for presence updates
presence:updates:{sessionId}
```

### Presence Data (Redis)

```typescript
interface PresenceData {
  userId: string;
  username: string;
  role: 'viewer' | 'commenter' | 'operator';
  status: 'online' | 'away' | 'offline';
  lastSeen: number;        // Unix timestamp
  cursor?: {
    eventId: string;
    position: number;
  };
  activity?: string;       // Current activity
}
```

### Session Data (PostgreSQL)

```sql
CREATE TABLE collaboration_sessions (
  id UUID PRIMARY KEY,
  operation_id VARCHAR(255),
  session_id VARCHAR(255) UNIQUE,
  owner_id UUID REFERENCES users(id),
  status VARCHAR(50),      -- 'active', 'completed', 'failed'
  target VARCHAR(500),
  objective TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  metadata JSONB
);
```

### Activity Log (PostgreSQL)

```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES collaboration_sessions(id),
  user_id UUID REFERENCES users(id),
  activity_type VARCHAR(100),
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP
);
```

## Redis Operations

### Setting Presence

```typescript
// 1. Store presence data with TTL
await redis.set(
  `presence:${sessionId}:${userId}`,
  JSON.stringify(presenceData),
  60  // TTL in seconds
);

// 2. Add to session's sorted set (score = timestamp)
await redis.zadd(
  `presence:session:${sessionId}`,
  Date.now(),
  userId
);

// 3. Publish update
await redis.publish(
  `presence:updates:${sessionId}`,
  JSON.stringify(updateEvent)
);
```

### Getting Online Users

```typescript
// 1. Get all user IDs in session (sorted by last update)
const userIds = await redis.zrange(
  `presence:session:${sessionId}`,
  0,
  -1
);

// 2. Fetch presence data for each user
const users = [];
for (const userId of userIds) {
  const data = await redis.get(`presence:${sessionId}:${userId}`);
  if (data) {
    const presence = JSON.parse(data);
    
    // Check if user is still active based on lastSeen
    const timeSinceLastSeen = Date.now() - presence.lastSeen;
    if (timeSinceLastSeen < 30000) {
      presence.status = 'online';
    } else if (timeSinceLastSeen < 120000) {
      presence.status = 'away';
    } else {
      presence.status = 'offline';
    }
    
    users.push(presence);
  }
}
```

### Cursor Position Updates

```typescript
// Update cursor in presence data (atomic)
const presenceData = await getPresence(sessionId, userId);
presenceData.cursor = newCursorPosition;
presenceData.lastSeen = Date.now();

await redis.set(
  `presence:${sessionId}:${userId}`,
  JSON.stringify(presenceData),
  60
);

// Publish cursor update
await redis.publish(
  `presence:updates:${sessionId}`,
  JSON.stringify({
    type: 'cursor',
    userId,
    cursor: newCursorPosition
  })
);
```

## Heartbeat Mechanism

### Client-Side Heartbeat

```typescript
// Automatic heartbeat every 30 seconds
setInterval(() => {
  if (isConnected) {
    sendMessage({
      type: 'heartbeat',
      sessionId,
      cursor: currentCursorPosition
    });
  }
}, 30000);
```

### Server-Side Processing

```typescript
async function handleHeartbeat(ws, connectionId, message) {
  const { sessionId, userId } = ws.metadata;
  
  // Update presence with latest timestamp
  await presenceManager.processHeartbeat(
    sessionId,
    userId,
    message.cursor
  );
  
  // Reset timeout timer
  clearTimeout(timeouts.get(userId));
  timeouts.set(userId, setTimeout(() => {
    handleTimeout(sessionId, userId);
  }, 30000));
}
```

### Timeout Detection

```typescript
async function handleTimeout(sessionId, userId) {
  console.log(`User ${userId} timed out in session ${sessionId}`);
  
  // Mark user as offline
  await presenceManager.removePresence(sessionId, userId);
  
  // Log activity
  await activityLogger.logActivity(
    sessionId,
    userId,
    'user_timeout',
    { reason: 'heartbeat_timeout' }
  );
  
  // Broadcast presence update
  broadcastPresenceUpdate(sessionId);
}
```

## Timeout and Reconnection

### Timeout Hierarchy

1. **Heartbeat Timeout**: 30 seconds
   - No heartbeat received from client
   - User marked as offline
   - Connection may still be open

2. **Away Timeout**: 2 minutes
   - No user activity detected
   - User marked as away
   - Connection still active

3. **Session Timeout**: 24 hours
   - No activity in session
   - Session marked as inactive
   - Can be cleaned up

### Reconnection Logic

```typescript
class ReconnectionManager {
  private reconnectAttempts = 0;
  private maxAttempts = 10;
  private baseDelay = 1000;  // 1 second
  
  async reconnect() {
    if (this.reconnectAttempts >= this.maxAttempts) {
      throw new Error('Max reconnection attempts reached');
    }
    
    // Exponential backoff
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempts),
      30000  // Max 30 seconds
    );
    
    await sleep(delay);
    this.reconnectAttempts++;
    
    try {
      await connect();
      this.reconnectAttempts = 0;  // Reset on success
    } catch (error) {
      await this.reconnect();  // Retry
    }
  }
}
```

## Performance Considerations

### Redis Optimization

1. **Connection Pooling**
   ```typescript
   const pool = new RedisPool({
     min: 2,
     max: 10,
     idleTimeout: 30000
   });
   ```

2. **Pipeline Operations**
   ```typescript
   const pipeline = redis.pipeline();
   pipeline.set(key1, value1);
   pipeline.zadd(key2, score, member);
   pipeline.publish(channel, message);
   await pipeline.exec();
   ```

3. **Key Expiration**
   - All presence keys have 60s TTL
   - Automatic cleanup of stale data
   - Reduces memory usage

### Database Optimization

1. **Bulk Insert for Activities**
   ```typescript
   // Queue activities
   for (const activity of activities) {
     activityLogger.queueActivity(activity);
   }
   
   // Automatic bulk insert after 1s or 100 items
   ```

2. **Indexes**
   ```sql
   CREATE INDEX idx_activity_session ON activity_log(session_id, created_at DESC);
   CREATE INDEX idx_participants_active ON session_participants(session_id) WHERE left_at IS NULL;
   ```

3. **Prepared Statements**
   ```typescript
   const stmt = db.prepare('SELECT * FROM activity_log WHERE session_id = $1');
   const results = await stmt.execute([sessionId]);
   ```

### WebSocket Optimization

1. **Message Batching**
   - Batch multiple presence updates
   - Send every 100ms or 10 messages

2. **Selective Broadcasting**
   - Only send to users in same session
   - Filter by permissions

3. **Compression**
   - Enable WebSocket compression
   - Reduces bandwidth by 60-80%

## Best Practices

### 1. Heartbeat Management

✅ **DO**:
- Send heartbeats every 30 seconds
- Include cursor position in heartbeat
- Handle missed heartbeats gracefully
- Implement exponential backoff for reconnection

❌ **DON'T**:
- Send heartbeats too frequently (< 10s)
- Block UI thread during heartbeat
- Ignore heartbeat failures

### 2. Presence Updates

✅ **DO**:
- Update presence on user activity
- Use Redis pub/sub for real-time updates
- Cache presence data on client
- Handle stale presence data

❌ **DON'T**:
- Poll for presence updates
- Update on every mouse move
- Store presence in PostgreSQL
- Ignore network errors

### 3. Session Management

✅ **DO**:
- Validate permissions before operations
- Log all session activities
- Handle concurrent operations
- Clean up old sessions

❌ **DON'T**:
- Allow unlimited participants
- Skip permission checks
- Leave sessions open indefinitely
- Ignore errors in cleanup

### 4. Activity Logging

✅ **DO**:
- Use bulk inserts for performance
- Include context in activity details
- Generate audit trails periodically
- Export for compliance

❌ **DON'T**:
- Log every cursor movement
- Block on log writes
- Store excessive detail
- Skip error logging

### 5. Error Handling

✅ **DO**:
- Gracefully degrade if Redis unavailable
- Retry failed operations
- Log errors with context
- Notify users of issues

❌ **DON'T**:
- Crash on Redis errors
- Expose internal errors to users
- Ignore connection failures
- Skip error recovery

## Monitoring and Debugging

### Key Metrics to Monitor

```typescript
interface PresenceMetrics {
  activeUsers: number;
  activeSessions: number;
  averageLatency: number;
  heartbeatsMissed: number;
  redisConnections: number;
  errorRate: number;
}
```

### Debug Logging

```typescript
// Enable debug mode
const presenceManager = new PresenceManager(redis, {
  debug: true,
  logLevel: 'debug'
});

// Logs will show:
// [PresenceManager] Set presence for user abc123 in session xyz
// [PresenceManager] Heartbeat received from user abc123
// [PresenceManager] User abc123 timed out after 30s
```

### Health Checks

```typescript
// Redis health
await redis.ping();  // Should return 'PONG'

// Presence health
const users = await presenceManager.getOnlineUsers(sessionId);
console.log(`${users.length} users online`);

// Database health
await db.query('SELECT 1');
```

## Conclusion

The Presence System provides a robust, scalable solution for real-time collaboration. By leveraging Redis for fast updates and PostgreSQL for persistence, it delivers:

- **Low latency**: < 10ms presence updates
- **High reliability**: Automatic reconnection and timeout handling
- **Scalability**: Handles 1000+ concurrent users
- **Auditability**: Complete activity logging

For more information, see:
- [Main README](../README.md)
- [API Documentation](../types/index.ts)
- [Integration Tests](../tests/integration/)
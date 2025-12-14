# Real-Time Collaboration - Quick Reference Guide

**Version:** 1.0  
**For:** Boo Security Assessment Tool  
**Last Updated:** 2025-12-13

---

## Quick Start

### Enable Collaboration for an Operation

```typescript
import { OperationManager } from './services/OperationManager';
import { CollaborationWebSocketServer } from './collaboration/ws-server';

// 1. Start collaboration server
const collabServer = new CollaborationWebSocketServer(httpServer);

// 2. Create operation with collaboration
const session = await operationManager.startWithCollaboration({
  target: 'example.com',
  objective: 'Penetration test',
  enableCollaboration: true,
  allowedUsers: ['alice', 'bob', 'carol']
});

// 3. Share session ID with team
console.log(`Join at: wss://server/collaboration?session=${session.id}`);
```

### Connect as a Viewer

```typescript
import { useCollaboration } from './hooks/useCollaboration';

function OperationViewer({ sessionId }) {
  const { 
    isConnected, 
    activeUsers, 
    comments,
    joinSession 
  } = useCollaboration();
  
  useEffect(() => {
    joinSession(sessionId);
  }, [sessionId]);
  
  return (
    <Box>
      <PresenceIndicator users={activeUsers} />
      <StreamDisplay comments={comments} />
    </Box>
  );
}
```

---

## Core Components

### Backend Services

| Service | Purpose | File |
|---------|---------|------|
| WebSocket Server | Connection & message routing | `collaboration/ws-server.ts` |
| Session Manager | Session lifecycle | `collaboration/session-manager.ts` |
| Presence Manager | User presence tracking | `collaboration/presence-manager.ts` |
| Collaboration Service | Comments & activities | `collaboration/collab-service.ts` |
| Auth Middleware | Authentication/authorization | `collaboration/auth-middleware.ts` |

### Frontend Components

| Component | Purpose | File |
|-----------|---------|------|
| CollaborationContext | State management | `contexts/CollaborationContext.tsx` |
| PresenceIndicator | Show active users | `components/collaboration/PresenceIndicator.tsx` |
| CommentSidebar | Comment UI | `components/collaboration/CommentSidebar.tsx` |
| ActivityFeed | Recent activities | `components/collaboration/ActivityFeed.tsx` |

### Hooks

| Hook | Purpose |
|------|---------|
| `useCollaboration()` | Main collaboration state |
| `usePresence()` | User presence tracking |
| `useComments()` | Comment management |

---

## WebSocket Messages

### Client → Server

```typescript
// Authenticate
{ type: 'auth', token: string, sessionId: string }

// Join session
{ type: 'session_join', sessionId: string }

// Add comment
{ 
  type: 'comment_add',
  sessionId: string,
  targetType: 'event' | 'finding' | 'line',
  targetId: string,
  content: string
}

// Heartbeat
{ type: 'heartbeat', sessionId: string, cursor?: object }
```

### Server → Client

```typescript
// Authentication result
{ type: 'auth_success', userId: string, role: string }

// Stream event
{ type: 'stream_event', sessionId: string, event: object }

// Presence update
{ type: 'presence_update', sessionId: string, users: array }

// Comment added
{ 
  type: 'comment_added',
  commentId: string,
  author: object,
  content: string
}
```

---

## Database Tables

### Essential Tables

1. **collaboration_sessions** - Operation sessions
2. **session_participants** - Who can access what
3. **comments** - User comments on events
4. **activity_log** - Audit trail
5. **users** - User accounts

### Quick Schema Reference

```sql
-- Create a session
INSERT INTO collaboration_sessions (operation_id, session_id, owner_id, target)
VALUES ('op-123', 'session-abc', 'user-uuid', 'example.com');

-- Add participant
INSERT INTO session_participants (session_id, user_id, role)
VALUES ('session-uuid', 'user-uuid', 'commenter');

-- Add comment
INSERT INTO comments (session_id, author_id, target_type, target_id, content)
VALUES ('session-uuid', 'user-uuid', 'event', 'event-123', 'Check this!');
```

---

## Redis Keys

### Presence Tracking

```
Key: presence:session:{sessionId}:user:{userId}
Type: Hash
TTL: 30 seconds
Fields: { username, role, status, lastSeen, cursor }
```

### Active Users

```
Key: session:{sessionId}:active_users
Type: Set
Members: [userId1, userId2, ...]
```

### Event Cache

```
Key: session:{sessionId}:events
Type: List
Max Length: 1000
```

### Pub/Sub

```
Channel: collab:session:{sessionId}
Purpose: Real-time event broadcasting
```

---

## Access Control

### Role Permissions

| Action | Viewer | Commenter | Operator | Admin |
|--------|--------|-----------|----------|-------|
| View operation | ✓ | ✓ | ✓ | ✓ |
| Add comment | ✗ | ✓ | ✓ | ✓ |
| Edit own comment | ✗ | ✓ | ✓ | ✓ |
| Delete own comment | ✗ | ✓ | ✓ | ✓ |
| Edit any comment | ✗ | ✗ | ✓ | ✓ |
| Manage session | ✗ | ✗ | ✓ | ✓ |

### Check Permission

```typescript
import { AuthenticationMiddleware } from './auth-middleware';

const auth = new AuthenticationMiddleware();
const canComment = await auth.checkPermission(userId, sessionId, 'add_comment');
```

---

## Configuration

### Environment Variables

```bash
# Server
COLLAB_WS_PORT=8080
COLLAB_API_PORT=8081

# Security
JWT_SECRET=your-secret-key
JWT_EXPIRATION=15m

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379

# Limits
MAX_CONNECTIONS_PER_SESSION=50
MAX_MESSAGE_SIZE=1048576
HEARTBEAT_INTERVAL=30000
```

### Docker Compose

```yaml
collaboration:
  image: boo-collaboration:latest
  ports:
    - "8080:8080"
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
    - JWT_SECRET=${JWT_SECRET}
  depends_on:
    - postgres
    - redis
```

---

## Testing

### Unit Test Example

```typescript
import { SessionManager } from './session-manager';

describe('SessionManager', () => {
  it('should create session', async () => {
    const manager = new SessionManager();
    const sessionId = await manager.createSession('op-123', 'user-1');
    expect(sessionId).toBeDefined();
  });
});
```

### Integration Test Example

```typescript
import { CollaborationWebSocketServer } from './ws-server';
import WebSocket from 'ws';

describe('WebSocket Integration', () => {
  it('should handle connection', (done) => {
    const ws = new WebSocket('ws://localhost:8080/collaboration');
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: 'test-token' }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      expect(msg.type).toBe('auth_success');
      done();
    });
  });
});
```

---

## Monitoring

### Key Metrics

```typescript
// Track these metrics
- ws.connections.active
- ws.messages.per_second
- ws.latency.avg
- comments.created.per_minute
- sessions.active.count
```

### Health Check

```bash
curl http://localhost:8081/health
```

Response:
```json
{
  "status": "healthy",
  "connections": 42,
  "sessions": 5,
  "uptime": 3600
}
```

---

## Troubleshooting

### Common Issues

**Connection Rejected**
- Check JWT token validity
- Verify session access permissions
- Check rate limits

**Events Not Streaming**
- Verify ExecutionService integration
- Check Redis pub/sub connectivity
- Review WebSocket connection status

**Comments Not Appearing**
- Check user role (must be commenter or higher)
- Verify session ID
- Check database connectivity

### Debug Mode

```bash
# Enable debug logging
DEBUG=collab:* npm start

# Or set environment variable
COLLAB_DEBUG=true npm start
```

---

## Performance Tips

### Optimize Event Streaming

```typescript
// Batch events to reduce message frequency
const batchEvents = (events: Event[], maxBatch: number = 10) => {
  return events.reduce((batches, event, i) => {
    const batchIndex = Math.floor(i / maxBatch);
    batches[batchIndex] = batches[batchIndex] || [];
    batches[batchIndex].push(event);
    return batches;
  }, [] as Event[][]);
};
```

### Optimize Comment Loading

```typescript
// Load comments lazily
const loadComments = async (targetId: string) => {
  const cached = commentCache.get(targetId);
  if (cached) return cached;
  
  const comments = await api.getComments(targetId);
  commentCache.set(targetId, comments);
  return comments;
};
```

---

## Security Checklist

- [ ] WSS (not WS) in production
- [ ] JWT tokens with short expiration
- [ ] Rate limiting enabled
- [ ] Input validation for all messages
- [ ] XSS prevention in comments
- [ ] SQL injection prevention
- [ ] Audit logging enabled
- [ ] Role-based access control configured

---

## API Endpoints

### REST API

```bash
# Sessions
POST   /api/collaboration/sessions
GET    /api/collaboration/sessions/:id
PATCH  /api/collaboration/sessions/:id
DELETE /api/collaboration/sessions/:id

# Comments
GET    /api/collaboration/sessions/:id/comments
POST   /api/collaboration/sessions/:id/comments
PATCH  /api/collaboration/comments/:id
DELETE /api/collaboration/comments/:id

# Activity
GET    /api/collaboration/sessions/:id/activity

# Participants
GET    /api/collaboration/sessions/:id/participants
POST   /api/collaboration/sessions/:id/participants
DELETE /api/collaboration/sessions/:id/participants/:userId
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] WebSocket server setup
- [ ] Authentication middleware
- [ ] Database schema
- [ ] Session manager
- [ ] WebSocket client library
- [ ] Connection handling
- [ ] Unit tests

### Phase 2: Presence
- [ ] Presence manager
- [ ] Presence UI component
- [ ] Heartbeat mechanism
- [ ] Session join/leave
- [ ] Activity logging
- [ ] Activity feed component

### Phase 3: Event Streaming
- [ ] ExecutionService integration
- [ ] Event broadcasting
- [ ] Event buffering
- [ ] StreamDisplay updates
- [ ] Cursor tracking
- [ ] Performance optimization

### Phase 4: Commenting
- [ ] Comment service methods
- [ ] Comment database ops
- [ ] Comment sidebar UI
- [ ] Comment indicators
- [ ] Comment threading
- [ ] Comment notifications

### Phase 5: Security
- [ ] Role-based access control
- [ ] Rate limiting
- [ ] Audit logging
- [ ] Input validation
- [ ] WSS with TLS
- [ ] Security testing

### Phase 6: Production
- [ ] Performance optimization
- [ ] Error handling
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Deployment scripts
- [ ] Monitoring setup

---

## Resources

- **Full Design Document:** [`real-time-collaboration-design.md`](./real-time-collaboration-design.md)
- **WebSocket Protocol:** See "WebSocket Protocol Specification" section
- **Database Schema:** See "Database Schema" section
- **Security Guidelines:** See "Security & Authentication" section

---

## Support

For questions or issues:
1. Check the full design document
2. Review existing code examples
3. Check monitoring dashboards
4. Contact the development team

---

**Quick Reference Version:** 1.0  
**Last Updated:** 2025-12-13
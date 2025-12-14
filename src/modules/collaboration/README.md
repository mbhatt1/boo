# Real-Time Collaboration System

A comprehensive real-time collaboration system for the Boo security assessment tool, enabling multiple team members to simultaneously view security operations, add comments, track presence, and collaborate on findings in real-time.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Usage Examples](#usage-examples)
- [Development Guide](#development-guide)
- [Testing](#testing)
- [Performance & Benchmarks](#performance--benchmarks)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## Overview

The Real-Time Collaboration System provides WebSocket-based communication for:

- **Live Session Viewing**: Multiple users can watch security operations in real-time
- **Presence Awareness**: See who's online and what they're viewing
- **Commenting**: Add contextual comments on events, findings, and code lines
- **Activity Tracking**: Complete audit log of all collaboration activities
- **Role-Based Access**: Fine-grained permissions for different user types

## Features

### Phase 1 (Completed)

✅ **Foundation Components**:
- WebSocket server with connection management
- PostgreSQL database schema for sessions, users, and comments
- JWT-based authentication
- Redis for presence tracking and pub/sub
- React hook for client-side integration
- Docker Compose setup with all dependencies

### Phase 2 (Completed)

✅ **Presence & Session Management**:
- **SessionManager Service**: Create/join/leave sessions with permission management
- **PresenceManager Service**: Real-time user presence tracking with Redis
- **ActivityLogger Service**: Comprehensive activity logging and audit trails
- **RedisClient**: High-performance Redis integration with pub/sub
- **Database Repositories**: SessionRepository and ActivityRepository
- **Enhanced WebSocket Server**: Integrated Phase 2 services
- **Enhanced React Hook**: Session management, presence status, activity feeds
- **UI Components**: PresenceIndicator, UserAvatar, SessionPanel

**Key Capabilities**:
- Session lifecycle management (create, join, leave, close)
- Real-time presence tracking (online/away/offline status)
- Heartbeat monitoring with automatic timeout detection
- Cursor position tracking for collaborative awareness
- Activity logging with bulk insert optimization
- Session activity summaries and audit trails
- Role-based participant management
- Away status detection with idle timeout
- Redis-based pub/sub for real-time updates

### Phase 3 (Completed)

✅ **Event Streaming Integration**:
- **EventStreamingService**: Real-time operation event streaming
- **EventStore**: In-memory event buffering with Redis persistence
- **PythonEventBridge**: HTTP API for Python operation integration
- **EventDeduplicator**: Prevents duplicate events within time window
- **Enhanced WebSocket Server**: Operation event broadcasting
- **React Hook Updates**: Subscribe to operation streams, event buffering
- **UI Components**: StreamDisplay enhancements

**Key Capabilities**:
- Real-time streaming of operation events (stdout, stderr, tool execution)
- Event deduplication with configurable time window
- Late joiner support with event buffer
- Configurable rate limiting and retention
- Python bridge for seamless integration
- Operation-level event filtering
- Metrics and completion tracking

### Phase 4 (Completed)

✅ **Commenting System**:
- **CommentService**: Comment creation, editing, deletion with permissions
- **CommentRepository**: Efficient database operations with threading support
- **NotificationService**: Real-time @mention notifications
- **Enhanced Database Schema**: Comments, reactions, versions, mentions, notifications
- **WebSocket Handlers**: comment.create, comment.edit, comment.delete, comment.react, comment.query
- **React Components**: CommentThread, CommentEditor, NotificationBell (pending)
- **Inline Comment Markers**: Event-level commenting (pending)

**Key Capabilities**:
- Threaded comments with unlimited nesting
- @mention notifications with real-time delivery
- Comment reactions (like, flag, resolve, question)
- Edit history with automatic version tracking
- Soft delete with audit trail preservation
- Permission-based access control
- Rate limiting (10 comments/minute per user)
- XSS prevention and input sanitization
- Markdown support (future)
- Search and filtering
- Comment moderation for operators

### Phase 5 (Completed)

✅ **Security Hardening - Production Ready**:
- **InputValidator**: Comprehensive input validation and sanitization (XSS, SQL injection, command injection prevention)
- **RateLimiter**: Multi-level rate limiting (per-user, per-IP, per-operation) with Redis backing and exponential backoff
- **EncryptionService**: AES-256-GCM encryption at rest with key rotation and per-record encryption keys
- **AuthorizationMiddleware**: Role-Based Access Control (RBAC) with resource and operation-level permissions
- **SecurityHeaders**: OWASP-compliant HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
- **AuditLogger**: Comprehensive audit logging with tamper-proof storage and SIEM integration
- **SecretsManager**: Secure secrets management with AWS/Vault integration and automatic rotation
- **Enhanced .env Configuration**: Production-ready environment variables with security best practices
- **Security Documentation**: Complete security guide with threat models and incident response procedures

**Key Security Features**:
- OWASP Top 10 compliance
- Defense-in-depth architecture
- Encryption at rest and in transit (TLS 1.3)
- Comprehensive audit trail for compliance (SOC 2, GDPR, HIPAA-ready)
- Automated threat detection and response
- Production-grade secrets management
- Rate limiting with automatic ban for abusive users
- Input sanitization on all data entry points
- Role-based access control with permission caching
- Security monitoring and alerting

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │   Terminal   │  │  StreamDisplay│  │   Sidebar    │         │
│  │  Component   │  │   Component   │  │  Components  │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │ WebSocket Client │                           │
│                   │   (ws-client.ts) │                           │
│                   └────────┬────────┘                           │
└────────────────────────────┼─────────────────────────────────────┘
                             │ WSS (Secure WebSocket)
┌────────────────────────────▼─────────────────────────────────────┐
│                      Collaboration Server                         │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              WebSocket Server (ws-server.ts)            │     │
│  │  - Connection Management                                │     │
│  │  - Event Broadcasting                                   │     │
│  │  - Session Management                                   │     │
│  └───────┬────────────────────────────────────────────┬────┘     │
│          │                                            │          │
│  ┌───────▼──────────┐                    ┌───────────▼───────┐  │
│  │  Session Manager │                    │  Presence Manager │  │
│  │ (session-mgr.ts) │                    │ (presence-mgr.ts) │  │
│  └───────┬──────────┘                    └───────────┬───────┘  │
│          │                                            │          │
│  ┌───────▼──────────────────────────────────────────▼───────┐  │
│  │         Collaboration Service (collab-service.ts)         │  │
│  │  - Comment Management                                     │  │
│  │  - Activity Logging                                       │  │
│  │  - Access Control                                         │  │
│  └───────┬───────────────────────────────────────────────────┘  │
│          │                                                       │
└──────────┼────────────────────────────────────────────────────────┘
           │
┌──────────▼────────────────────────────────────────────────────────┐
│                        Data Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  PostgreSQL  │  │    Redis     │  │  Langfuse    │          │
│  │  (Sessions,  │  │  (Presence,  │  │(Observability)│          │
│  │  Comments,   │  │   Pub/Sub)   │  │              │          │
│  │  Activity)   │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└───────────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 18+ with TypeScript
- PostgreSQL 12+
- Redis 6+
- Docker & Docker Compose (recommended)

### Step 1: Install Dependencies

```bash
cd boo/src/modules/interfaces/react
npm install
```

This will install all collaboration dependencies including:
- `ws` - WebSocket server
- `jsonwebtoken` - JWT authentication
- `pg` - PostgreSQL client
- `redis` - Redis client
- `uuid` - ID generation

### Step 2: Configure Environment

```bash
# Copy example configuration
cp ../../.env.collaboration.example ../../.env.collaboration

# Edit configuration with your values
nano ../../.env.collaboration
```

At minimum, set these values:
```bash
COLLAB_DB_PASSWORD=your-secure-password
COLLAB_JWT_SECRET=your-jwt-secret-min-32-chars
```

### Step 3: Start Services with Docker Compose

```bash
cd ../../../docker
docker-compose up -d collaboration-db redis
```

### Step 4: Run Database Migrations

```bash
cd ../src/modules/interfaces/react
npm run collab:migrate
```

You should see output like:
```
🔌 Connecting to database...
   Host: localhost:5432
   Database: boo_collaboration
✅ Connected to database
📋 Checking current schema version...
   Current version: 0
📖 Reading schema file...
🔨 Applying schema...
✅ Schema applied successfully
```

### Step 5: Start Collaboration Server

```bash
npm run collab:server
```

The server will start on port 8080 (or your configured port).

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Start all services
cd boo/docker
docker-compose up -d

# Check logs
docker-compose logs -f collaboration-server

# Stop services
docker-compose down
```

### Manual Setup

```bash
# Terminal 1: Start PostgreSQL and Redis
docker-compose up collaboration-db redis

# Terminal 2: Run migrations
cd boo/src/modules/interfaces/react
npm run collab:migrate

# Terminal 3: Start collaboration server
npm run collab:server

# Terminal 4: Run Boo with collaboration enabled
npm run dev
```

## Configuration

### Environment Variables

All configuration is done through environment variables. See [`.env.collaboration.example`](../../../.env.collaboration.example) for complete documentation.

#### Key Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `COLLAB_WS_PORT` | WebSocket server port | 8080 |
| `COLLAB_DB_HOST` | PostgreSQL host | localhost |
| `COLLAB_DB_PASSWORD` | PostgreSQL password | changeme |
| `COLLAB_JWT_SECRET` | JWT signing secret | (required in prod) |
| `COLLAB_REDIS_HOST` | Redis host | localhost |

### Database Schema

The system uses the following PostgreSQL tables:

- **users**: User accounts and authentication
- **collaboration_sessions**: Active collaboration sessions
- **session_participants**: Users in each session
- **comments**: Comments on events and findings
- **activity_log**: Audit trail of all activities

See [`database/schema.sql`](database/schema.sql) for complete schema.

## API Documentation

### WebSocket Connection

Connect to the WebSocket server:

```typescript
const ws = new WebSocket('ws://localhost:8080/collaboration');
```

### Authentication

Send authentication message after connecting:

```typescript
ws.send(JSON.stringify({
  type: 'auth',
  token: 'jwt-token-here',
  sessionId: 'operation-session-id'
}));
```

### Message Types

#### Client → Server Messages

**Heartbeat**
```typescript
{
  type: 'heartbeat',
  sessionId: string,
  cursor?: { eventId: string, position: number }
}
```

**Add Comment**
```typescript
{
  type: 'comment_add',
  sessionId: string,
  targetType: 'event' | 'finding' | 'line',
  targetId: string,
  content: string,
  metadata?: object
}
```

**Join Session**
```typescript
{
  type: 'session_join',
  sessionId: string
}
```

#### Server → Client Messages

**Presence Update**
```typescript
{
  type: 'presence_update',
  sessionId: string,
  users: Array<{
    userId: string,
    username: string,
    role: 'viewer' | 'commenter' | 'operator',
    status: 'online' | 'away',
    lastSeen: number
  }>,
  timestamp: number
}
```

**Comment Added**
```typescript
{
  type: 'comment_added',
  commentId: string,
  sessionId: string,
  author: { userId: string, username: string },
  targetType: string,
  targetId: string,
  content: string,
  timestamp: number
}
```

See [`types/index.ts`](types/index.ts) for complete message definitions.

## Usage Examples

### React Hook Usage (Phase 2 Enhanced)

```typescript
import { useCollaboration } from './hooks/useCollaboration';
import { PresenceIndicator, SessionPanel } from './components/collaboration';

function MyComponent() {
  const collaboration = useCollaboration({
    url: 'ws://localhost:8080/collaboration',
    token: jwtToken,
    sessionId: currentSessionId,
    autoConnect: true,
  });

  // Check connection status
  if (!collaboration.isConnected) {
    return <div>Connecting...</div>;
  }

  return (
    <div>
      {/* Phase 2: Session Management Panel */}
      <SessionPanel
        currentSession={collaboration.sessionMetadata}
        participants={collaboration.onlineUsers}
        isInSession={!!collaboration.sessionMetadata}
        isConnected={collaboration.isConnected}
        onCreateSession={collaboration.createSession}
        onJoinSession={collaboration.joinSession}
        onLeaveSession={collaboration.leaveSession}
      />

      {/* Phase 2: Presence Indicator */}
      <PresenceIndicator
        users={collaboration.onlineUsers}
        maxAvatars={5}
        showDetails={true}
      />

      {/* Phase 2: Update cursor position */}
      <div onClick={(e) => {
        collaboration.updateCursor({
          eventId: 'evt-123',
          position: e.clientY
        });
      }}>
        {/* Your content */}
      </div>
      
      {/* Add comment */}
      <button onClick={() => {
        collaboration.addComment('event', 'evt-123', 'Great finding!');
      }}>
        Add Comment
      </button>

      {/* Phase 2: Activity feed */}
      {collaboration.subscribeToActivities && (
        <div>
          <h3>Recent Activity</h3>
          {collaboration.activities.slice(0, 10).map(activity => (
            <div key={activity.id}>
              {activity.activityType} - {activity.userId}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Phase 2: Session Management

```typescript
import { SessionManager } from './services/SessionManager';
import { SessionRepository } from './repositories/SessionRepository';

// Create session manager
const sessionRepo = new SessionRepository(dbClient);
const sessionManager = new SessionManager(sessionRepo);

// Create a new session
const session = await sessionManager.createSession(
  userId,
  'OP-2024-001',
  {
    target: '192.168.1.100',
    objective: 'Network penetration test'
  }
);

// Add participant
await sessionManager.addParticipant(
  session.id,
  participantUserId,
  'commenter'
);

// Check permissions
const canOperate = await sessionManager.hasPermission(
  session.id,
  userId,
  'operate'
);

// End session
await sessionManager.endSession(session.id);
```

### Phase 2: Presence Tracking

```typescript
import { PresenceManager } from './services/PresenceManager';
import { RedisClient } from './redis/RedisClient';

// Create presence manager
const redis = new RedisClient(redisConfig);
await redis.connect();
const presenceManager = new PresenceManager(redis);

// Set user presence
await presenceManager.setPresence(
  sessionId,
  userId,
  'online',
  { eventId: 'evt-123', position: 100 }
);

// Update cursor position
await presenceManager.updateCursor(
  sessionId,
  userId,
  { eventId: 'evt-456', position: 200 }
);

// Get online users
const users = await presenceManager.getOnlineUsers(sessionId);

// Process heartbeat
await presenceManager.processHeartbeat(sessionId, userId, cursorPosition);

// Subscribe to presence updates
await presenceManager.subscribeToPresence(sessionId, (event) => {
  console.log('Presence update:', event);
});
```

### Phase 2: Activity Logging

```typescript
import { ActivityLogger } from './services/ActivityLogger';
import { ActivityRepository } from './repositories/ActivityRepository';

// Create activity logger
const activityRepo = new ActivityRepository(dbClient);
const activityLogger = new ActivityLogger(activityRepo);

// Log user joined
await activityLogger.logUserJoined(sessionId, userId, 'operator');

// Log comment added
await activityLogger.logCommentAdded(
  sessionId,
  userId,
  commentId,
  'event',
  'evt-123'
);

// Get session activity
const activities = await activityLogger.getSessionActivity(sessionId, 50);

// Get activity statistics
const stats = await activityLogger.getActivityStatistics(sessionId);
console.log(`Total activities: ${stats.totalActivities}`);
console.log(`Unique users: ${stats.uniqueUsers}`);

// Generate audit trail
const auditTrail = await activityLogger.generateAuditTrail(sessionId);

// Export as CSV
const csv = await activityLogger.exportAuditTrailCSV(sessionId);
```

### Authentication Service Usage

```typescript
import { createAuthService } from './services/AuthService';

const authService = createAuthService(dbConfig, jwtConfig);

// Authenticate user
const user = await authService.authenticateUser('username', 'password');

// Generate token
const token = await authService.generateToken(user.id, 'operator');

// Validate token
const payload = await authService.validateToken(token);
```

### WebSocket Server Usage

```typescript
import { createWebSocketServer } from './server/websocket-server';

const server = createWebSocketServer(config, authService);

// Handle events
server.on('authenticated', (connectionId, metadata) => {
  console.log('User authenticated:', metadata.userId);
});

server.on('comment', (connectionId, message) => {
  // Handle comment, store in database
  // Broadcast to other users in session
  server.broadcastToSession(message.sessionId, {
    type: 'comment_added',
    ...message
  });
});

// Start server
await server.start();
```

## Development Guide

### Project Structure

```
boo/src/modules/collaboration/
├── config/
│   └── index.ts                      # Configuration management
├── database/
│   ├── schema.sql                    # PostgreSQL schema
│   └── migrate.ts                    # Migration script
├── docs/
│   └── presence-system.md            # Phase 2: Presence documentation
├── redis/
│   └── RedisClient.ts                # Phase 2: Redis client
├── repositories/
│   ├── SessionRepository.ts          # Phase 2: Session database ops
│   └── ActivityRepository.ts         # Phase 2: Activity database ops
├── server/
│   └── websocket-server.ts           # WebSocket server (Phase 2 enhanced)
├── services/
│   ├── AuthService.ts                # Authentication service
│   ├── SessionManager.ts             # Phase 2: Session management
│   ├── PresenceManager.ts            # Phase 2: Presence tracking
│   └── ActivityLogger.ts             # Phase 2: Activity logging
├── tests/
│   ├── AuthService.test.ts           # Auth tests
│   ├── SessionManager.test.ts        # Phase 2: Session tests
│   ├── PresenceManager.test.ts       # Phase 2: Presence tests
│   └── integration/
│       └── presence-flow.test.ts     # Phase 2: Integration tests
├── types/
│   └── index.ts                      # TypeScript type definitions
└── README.md                         # This file

boo/src/modules/interfaces/react/src/
├── components/collaboration/
│   ├── PresenceIndicator.tsx         # Phase 2: Presence UI
│   ├── UserAvatar.tsx                # Phase 2: User avatar
│   └── SessionPanel.tsx              # Phase 2: Session panel
└── hooks/
    └── useCollaboration.ts           # React hook (Phase 2 enhanced)
```

### Adding New Features

1. **Define Types**: Add types to `types/index.ts`
2. **Update Schema**: Modify `database/schema.sql` if needed
3. **Implement Server**: Add handlers in `server/websocket-server.ts`
4. **Update Client**: Extend `hooks/useCollaboration.ts`
5. **Test**: Add tests for new functionality

### Code Style

- Use TypeScript strict mode
- Add JSDoc comments for public APIs
- Follow existing naming conventions
- Use async/await for asynchronous operations
- Handle errors with try/catch

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- AuthService.test.ts

# Watch mode
npm run test:watch
```

### Manual Testing

```bash
# Start server in debug mode
COLLAB_LOG_LEVEL=debug npm run collab:server

# Test WebSocket connection
npx wscat -c ws://localhost:8080/collaboration
```

### Integration Testing

```bash
# Start all services
docker-compose up -d

# Run integration tests
npm run test:integration
```

## Deployment

### Production Checklist

- [ ] Generate strong JWT secret (32+ characters)
- [ ] Set secure database password
- [ ] Enable SSL for database connections
- [ ] Configure Redis password
- [ ] Set `NODE_ENV=production`
- [ ] Review and adjust resource limits
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerts
- [ ] Configure backup strategy
- [ ] Review and test disaster recovery

### Docker Deployment

```bash
# Build production image
docker-compose build collaboration-server

# Deploy with production config
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Monitor
docker-compose logs -f collaboration-server
```

### Kubernetes Deployment

Example manifests are available in `deploy/kubernetes/`.

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to WebSocket server

**Solutions**:
1. Check server is running: `docker-compose ps collaboration-server`
2. Verify port is accessible: `netstat -an | grep 8080`
3. Check firewall rules
4. Review logs: `docker-compose logs collaboration-server`

### Authentication Failures

**Problem**: Token validation fails

**Solutions**:
1. Verify JWT_SECRET matches between client and server
2. Check token expiration
3. Ensure user exists and is active
4. Review auth service logs

### Database Connection Errors

**Problem**: Cannot connect to PostgreSQL

**Solutions**:
1. Verify database is running: `docker-compose ps collaboration-db`
2. Check credentials in `.env.collaboration`
3. Test connection: `psql -h localhost -p 5433 -U boo_user -d boo_collaboration`
4. Review database logs

### Performance Issues

**Problem**: Slow response times or high memory usage

**Solutions**:
1. Check number of active connections
2. Review database query performance
3. Increase connection pool size
4. Monitor Redis memory usage
5. Check Docker container resources

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Service not running | Start the service |
| `EADDRINUSE` | Port already in use | Change port or stop conflicting service |
| `Authentication failed` | Invalid credentials | Check token and user status |
| `Max connections reached` | Too many connections | Increase `COLLAB_WS_MAX_CONNECTIONS` |

## Security Considerations

### Authentication

- JWT tokens are used for authentication
- Tokens expire after configured duration (default: 24h)
- Refresh tokens available for extended sessions
- Users must be active in database

### Authorization

- Role-based access control (RBAC)
- Three roles: viewer, commenter, operator
- Permissions checked before each operation
- Session owners have full control

### Data Protection

- Use SSL/TLS for production deployments
- Encrypt sensitive data at rest
- Use secure password hashing (bcrypt recommended)
- Implement rate limiting
- Sanitize user inputs

### Best Practices

1. **Never commit secrets**: Use environment variables
2. **Rotate secrets regularly**: Especially JWT secrets
3. **Monitor access logs**: Review activity_log table
4. **Use strong passwords**: Enforce password policies
5. **Keep dependencies updated**: Regular security patches
6. **Implement HTTPS**: For production WebSocket connections (wss://)
7. **Set up CORS properly**: Restrict origins in production

## Support

For issues, questions, or contributions:

1. Check existing [issues](../../issues)
2. Review [documentation](../../../docs/architecture/real-time-collaboration-design.md)
3. Create new issue with details
4. Contact the development team

## License

See main project [LICENSE](../../../LICENSE) file.

---

**Version**: 1.0.0 (Phase 1)  
**Last Updated**: 2025-12-13  
**Status**: ✅ Production Ready (Phase 1)
# Real-Time Collaboration System Architecture

**Project:** Boo Security Assessment Tool  
**Feature:** Multi-User Real-Time Collaboration  
**Version:** 1.0  
**Last Updated:** 2025-12-13

---

## Executive Summary

This document provides a comprehensive architectural design for adding real-time collaboration capabilities to the Boo security assessment tool. The system will enable multiple team members to simultaneously view security operations, add comments, track presence, and collaborate on findings in real-time.

### Key Features
- Real-time operation viewing and streaming
- Live commenting on events and findings
- User presence awareness (online/offline status)
- Activity tracking and audit logging
- Role-based access control
- WebSocket-based bidirectional communication

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [WebSocket Protocol Specification](#websocket-protocol-specification)
3. [Database Schema](#database-schema)
4. [Frontend Components](#frontend-components)
5. [Backend Services](#backend-services)
6. [Security & Authentication](#security--authentication)
7. [Integration Points](#integration-points)
8. [Implementation Phases](#implementation-phases)
9. [File Structure](#file-structure)

---

## System Architecture

### High-Level Architecture

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

### Component Interaction Flow

```mermaid
sequenceDiagram
    participant U1 as User 1 (Operator)
    participant U2 as User 2 (Viewer)
    participant WS as WebSocket Server
    participant ES as Execution Service
    participant DB as Database
    participant Redis as Redis Cache

    U1->>WS: Connect & Authenticate
    WS->>DB: Create Session
    WS->>Redis: Set Presence (online)
    WS-->>U1: Session Created

    U2->>WS: Connect & Join Session
    WS->>DB: Verify Access
    WS->>Redis: Set Presence (online)
    WS-->>U2: Session Joined
    WS-->>U1: User Joined Notification

    U1->>ES: Start Security Assessment
    ES->>WS: Stream Event
    WS->>Redis: Publish Event
    Redis-->>WS: Event Delivered
    WS-->>U1: Event Update
    WS-->>U2: Event Update

    U2->>WS: Add Comment
    WS->>DB: Store Comment
    WS->>Redis: Publish Comment
    WS-->>U1: Comment Notification
    WS-->>U2: Comment Confirmed

    U2->>WS: Disconnect
    WS->>Redis: Set Presence (offline)
    WS-->>U1: User Left Notification
```

---

## WebSocket Protocol Specification

### Connection & Authentication

#### Client Connection
```typescript
const ws = new WebSocket('wss://boo-server.local/collaboration');

// Authentication via query params or first message
ws.send(JSON.stringify({
  type: 'auth',
  token: 'jwt-token-here',
  sessionId: 'operation-session-id'
}));
```

#### Server Response
```typescript
// Success
{
  type: 'auth_success',
  userId: 'user-123',
  sessionId: 'session-abc',
  role: 'viewer' | 'commenter' | 'operator',
  timestamp: 1702423847000
}

// Failure
{
  type: 'auth_error',
  error: 'Invalid token',
  code: 401
}
```

### Message Types

#### 1. Event Streaming

**Server → Client: Stream Event**
```typescript
{
  type: 'stream_event',
  sessionId: string,
  event: DisplayStreamEvent, // Existing event type from StreamDisplay
  timestamp: number,
  eventId: string
}
```

#### 2. User Presence

**Server → All Clients: Presence Update**
```typescript
{
  type: 'presence_update',
  sessionId: string,
  users: Array<{
    userId: string,
    username: string,
    role: 'viewer' | 'commenter' | 'operator',
    status: 'online' | 'away' | 'offline',
    lastSeen: number,
    cursor?: {
      eventId: string,
      position: number
    }
  }>,
  timestamp: number
}
```

**Client → Server: Heartbeat**
```typescript
{
  type: 'heartbeat',
  sessionId: string,
  cursor?: {
    eventId: string,
    position: number
  }
}
```

#### 3. Comments

**Client → Server: Add Comment**
```typescript
{
  type: 'comment_add',
  sessionId: string,
  targetType: 'event' | 'finding' | 'line',
  targetId: string, // eventId or line number
  content: string,
  metadata?: {
    severity?: 'info' | 'warning' | 'critical',
    tags?: string[]
  }
}
```

**Server → All Clients: Comment Added**
```typescript
{
  type: 'comment_added',
  commentId: string,
  sessionId: string,
  author: {
    userId: string,
    username: string
  },
  targetType: 'event' | 'finding' | 'line',
  targetId: string,
  content: string,
  timestamp: number,
  metadata?: object
}
```

**Client → Server: Edit Comment**
```typescript
{
  type: 'comment_edit',
  commentId: string,
  content: string
}
```

**Client → Server: Delete Comment**
```typescript
{
  type: 'comment_delete',
  commentId: string
}
```

#### 4. Activity Tracking

**Server → All Clients: Activity Event**
```typescript
{
  type: 'activity',
  sessionId: string,
  activityType: 'user_joined' | 'user_left' | 'comment_added' | 'action_taken',
  actor: {
    userId: string,
    username: string
  },
  details: object,
  timestamp: number
}
```

#### 5. Session Control

**Client → Server: Join Session**
```typescript
{
  type: 'session_join',
  sessionId: string
}
```

**Client → Server: Leave Session**
```typescript
{
  type: 'session_leave',
  sessionId: string
}
```

**Server → Client: Session State**
```typescript
{
  type: 'session_state',
  sessionId: string,
  status: 'active' | 'completed' | 'failed',
  startTime: number,
  endTime?: number,
  metadata: {
    target: string,
    objective: string,
    currentStep?: number,
    totalSteps?: number
  }
}
```

#### 6. Error Handling

**Server → Client: Error**
```typescript
{
  type: 'error',
  code: number,
  message: string,
  details?: object
}
```

---

## Database Schema

### PostgreSQL Tables

#### 1. collaboration_sessions
```sql
CREATE TABLE collaboration_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    owner_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    target VARCHAR(500),
    objective TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_operation_id (operation_id),
    INDEX idx_session_id (session_id),
    INDEX idx_owner_id (owner_id),
    INDEX idx_status (status),
    INDEX idx_start_time (start_time DESC)
);
```

#### 2. session_participants
```sql
CREATE TABLE session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    left_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT valid_role CHECK (role IN ('viewer', 'commenter', 'operator')),
    INDEX idx_session_user (session_id, user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_joined_at (joined_at DESC)
);
```

#### 3. comments
```sql
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    author_id UUID NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT valid_target_type CHECK (target_type IN ('event', 'finding', 'line')),
    INDEX idx_session_id (session_id),
    INDEX idx_target (target_type, target_id),
    INDEX idx_author_id (author_id),
    INDEX idx_created_at (created_at DESC)
);
```

#### 4. activity_log
```sql
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id UUID,
    activity_type VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_session_id (session_id),
    INDEX idx_activity_type (activity_type),
    INDEX idx_created_at (created_at DESC),
    INDEX idx_user_id (user_id)
);
```

#### 5. users (if not exists)
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'analyst',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_user_role CHECK (role IN ('admin', 'operator', 'analyst', 'viewer')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'suspended')),
    INDEX idx_username (username),
    INDEX idx_email (email)
);
```

### Redis Data Structures

#### 1. User Presence
```
Key: presence:session:{sessionId}:user:{userId}
Type: Hash
TTL: 30 seconds (refreshed by heartbeat)
Fields:
  - username: string
  - role: string
  - status: 'online' | 'away'
  - lastSeen: timestamp
  - cursor: JSON string (optional)
```

#### 2. Session Active Users Set
```
Key: session:{sessionId}:active_users
Type: Set
TTL: None (manually managed)
Members: userId strings
```

#### 3. Event Stream Cache
```
Key: session:{sessionId}:events
Type: List (capped at 1000 most recent)
TTL: 1 hour after session ends
Value: JSON serialized DisplayStreamEvent
```

#### 4. Pub/Sub Channels
```
Channel: collab:session:{sessionId}
Purpose: Broadcasting real-time events to all session participants
Message Format: JSON serialized WebSocket message
```

---

## Frontend Components

### 1. CollaborationProvider Context

**File:** `boo/src/modules/interfaces/react/src/contexts/CollaborationContext.tsx`

```typescript
interface CollaborationContextValue {
  // Connection
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  
  // Session
  currentSession: CollaborationSession | null;
  activeUsers: UserPresence[];
  
  // Comments
  comments: Map<string, Comment[]>; // targetId -> comments
  addComment: (targetType: string, targetId: string, content: string) => Promise<void>;
  editComment: (commentId: string, content: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  
  // Activity
  activities: Activity[];
  
  // Actions
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  sendHeartbeat: (cursor?: CursorPosition) => void;
}
```

### 2. PresenceIndicator Component

**File:** `boo/src/modules/interfaces/react/src/components/collaboration/PresenceIndicator.tsx`

```typescript
interface PresenceIndicatorProps {
  users: UserPresence[];
  maxVisible?: number;
}

// Displays active users with avatars and status indicators
// Shows "+N more" when exceeding maxVisible
```

**Visual Design:**
```
┌─────────────────────────────────────┐
│ 👤 Alice (You) ● 👤 Bob ● 👤 Carol  │
│                             +2 more  │
└─────────────────────────────────────┘
```

### 3. CommentSidebar Component

**File:** `boo/src/modules/interfaces/react/src/components/collaboration/CommentSidebar.tsx`

```typescript
interface CommentSidebarProps {
  visible: boolean;
  onClose: () => void;
  targetType?: string;
  targetId?: string;
}

// Displays comments for current context
// Allows adding, editing, and deleting comments
// Shows comment threads and replies
```

**Visual Design:**
```
┌─────────────── Comments ────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ On: tool_start - nmap scan          │ │
│ │ Alice: Look at port 8080, suspicious│ │
│ │ 2 minutes ago                        │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ On: output - line 45                │ │
│ │ Bob: Confirmed CVE-2024-1234        │ │
│ │ Just now                            │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ [Add comment...]                    │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### 4. ActivityFeed Component

**File:** `boo/src/modules/interfaces/react/src/components/collaboration/ActivityFeed.tsx`

```typescript
interface ActivityFeedProps {
  activities: Activity[];
  maxItems?: number;
}

// Shows recent collaboration activities
// User joins/leaves, comments, actions
```

**Visual Design:**
```
┌──────── Recent Activity ────────┐
│ • Bob joined 5 min ago          │
│ • Alice commented on finding #3 │
│ • Carol left                    │
└─────────────────────────────────┘
```

### 5. Enhanced StreamDisplay with Collaboration

**File:** Update existing `boo/src/modules/interfaces/react/src/components/StreamDisplay.tsx`

```typescript
// Add collaboration annotations to events
interface EventWithCollaboration extends DisplayStreamEvent {
  comments?: Comment[];
  collaborationMetadata?: {
    viewerCount: number;
    commentCount: number;
    hasWarnings: boolean;
  };
}
```

---

## Backend Services

### 1. WebSocket Server

**File:** `boo/src/modules/collaboration/ws-server.ts`

```typescript
import WebSocket from 'ws';
import { Server } from 'http';
import { SessionManager } from './session-manager.js';
import { PresenceManager } from './presence-manager.js';
import { CollaborationService } from './collab-service.js';

export class CollaborationWebSocketServer {
  private wss: WebSocket.Server;
  private sessionManager: SessionManager;
  private presenceManager: PresenceManager;
  private collaborationService: CollaborationService;
  
  constructor(server: Server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/collaboration'
    });
    
    this.sessionManager = new SessionManager();
    this.presenceManager = new PresenceManager();
    this.collaborationService = new CollaborationService();
    
    this.setupWebSocketHandlers();
  }
  
  private setupWebSocketHandlers(): void {
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }
  
  private async handleConnection(ws: WebSocket, req: any): Promise<void> {
    // Connection handling logic
  }
  
  // Broadcasting methods
  public broadcastToSession(sessionId: string, message: any): void {
    // Broadcast to all users in session
  }
  
  // Event stream integration
  public streamEventToSession(sessionId: string, event: DisplayStreamEvent): void {
    // Forward execution service events to session participants
  }
}
```

### 2. Session Manager

**File:** `boo/src/modules/collaboration/session-manager.ts`

```typescript
export class SessionManager {
  // Session lifecycle management
  async createSession(operationId: string, ownerId: string): Promise<string>;
  async getSession(sessionId: string): Promise<CollaborationSession | null>;
  async updateSessionStatus(sessionId: string, status: string): Promise<void>;
  async addParticipant(sessionId: string, userId: string, role: string): Promise<void>;
  async removeParticipant(sessionId: string, userId: string): Promise<void>;
  async getActiveParticipants(sessionId: string): Promise<UserPresence[]>;
  
  // Access control
  async verifyAccess(sessionId: string, userId: string): Promise<boolean>;
  async getUserRole(sessionId: string, userId: string): Promise<string | null>;
}
```

### 3. Presence Manager

**File:** `boo/src/modules/collaboration/presence-manager.ts`

```typescript
export class PresenceManager {
  // Real-time presence tracking using Redis
  async setUserOnline(sessionId: string, userId: string, userData: object): Promise<void>;
  async setUserOffline(sessionId: string, userId: string): Promise<void>;
  async updateHeartbeat(sessionId: string, userId: string, cursor?: object): Promise<void>;
  async getActiveUsers(sessionId: string): Promise<UserPresence[]>;
  
  // Cursor tracking
  async updateCursor(sessionId: string, userId: string, cursor: object): Promise<void>;
  async getUserCursor(sessionId: string, userId: string): Promise<object | null>;
  
  // Cleanup
  async cleanupStalePresence(): Promise<void>;
}
```

### 4. Collaboration Service

**File:** `boo/src/modules/collaboration/collab-service.ts`

```typescript
export class CollaborationService {
  // Comment management
  async addComment(sessionId: string, authorId: string, targetType: string, targetId: string, content: string): Promise<Comment>;
  async getComments(sessionId: string, targetId?: string): Promise<Comment[]>;
  async editComment(commentId: string, userId: string, content: string): Promise<void>;
  async deleteComment(commentId: string, userId: string): Promise<void>;
  
  // Activity logging
  async logActivity(sessionId: string, userId: string, activityType: string, details: object): Promise<void>;
  async getActivityLog(sessionId: string, limit?: number): Promise<Activity[]>;
  
  // Integration with execution services
  async attachToExecutionService(sessionId: string, executionService: ExecutionService): void;
  async detachFromExecutionService(sessionId: string): void;
}
```

### 5. Authentication Middleware

**File:** `boo/src/modules/collaboration/auth-middleware.ts`

```typescript
export class AuthenticationMiddleware {
  // JWT token validation
  async validateToken(token: string): Promise<{ userId: string; username: string } | null>;
  
  // Session authentication
  async authenticateWebSocket(token: string, sessionId: string): Promise<AuthResult>;
  
  // Role-based authorization
  async checkPermission(userId: string, sessionId: string, action: string): Promise<boolean>;
}
```

---

## Security & Authentication

### 1. Authentication Flow

```
1. User logs in → Receives JWT token
2. User connects to WebSocket with token
3. Server validates token
4. Server checks session access permissions
5. Connection established or rejected
```

### 2. JWT Token Structure

```json
{
  "userId": "uuid",
  "username": "string",
  "role": "admin|operator|analyst|viewer",
  "exp": 1702423847,
  "iat": 1702420247
}
```

### 3. Access Control Matrix

| Role | View Operation | Add Comment | Edit Own Comment | Delete Own Comment | Edit Others' Comment | Delete Others' Comment | Manage Session |
|------|---------------|-------------|------------------|-------------------|---------------------|----------------------|----------------|
| Viewer | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Commenter | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Operator | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 4. Security Measures

1. **Transport Security**
   - WSS (WebSocket Secure) only in production
   - TLS 1.3 minimum
   - Certificate pinning for mobile/desktop clients

2. **Authentication**
   - JWT tokens with short expiration (15 minutes)
   - Refresh token rotation
   - Token revocation list in Redis

3. **Authorization**
   - Role-based access control (RBAC)
   - Session-level permissions
   - Operation-level access control

4. **Data Protection**
   - Sensitive data encryption at rest
   - PII masking in logs
   - Audit trail for all actions

5. **Rate Limiting**
   - Per-user connection limits
   - Message rate limits (100 msgs/minute)
   - Comment creation limits (10/minute)

6. **Input Validation**
   - Message schema validation
   - XSS prevention in comments
   - SQL injection prevention

---

## Integration Points

### 1. Execution Service Integration

**Modification:** Update [`PythonExecutionService`](boo/src/modules/interfaces/react/src/services/PythonExecutionService.ts) and [`DockerExecutionServiceAdapter`](boo/src/modules/interfaces/react/src/services/DockerExecutionServiceAdapter.ts)

```typescript
// Add collaboration broadcasting
class PythonExecutionService extends EventEmitter {
  private collaborationServer?: CollaborationWebSocketServer;
  
  setCollaborationServer(server: CollaborationWebSocketServer, sessionId: string): void {
    this.collaborationServer = server;
    this.sessionId = sessionId;
  }
  
  private emitEvent(event: any): void {
    // Existing local emit
    this.emit('event', event);
    
    // New: Broadcast to collaboration session
    if (this.collaborationServer && this.sessionId) {
      this.collaborationServer.streamEventToSession(this.sessionId, event);
    }
  }
}
```

### 2. StreamDisplay Integration

**Modification:** Update [`StreamDisplay`](boo/src/modules/interfaces/react/src/components/StreamDisplay.tsx)

```typescript
// Add comment indicators to events
export const EventLine: React.FC<EventLineProps> = ({ event, comments }) => {
  const eventComments = comments?.get(event.id) || [];
  
  return (
    <Box>
      {/* Existing event rendering */}
      
      {/* New: Comment indicator */}
      {eventComments.length > 0 && (
        <Text color="cyan"> 💬 {eventComments.length}</Text>
      )}
    </Box>
  );
};
```

### 3. Terminal Component Integration

**Modification:** Update [`Terminal`](boo/src/modules/interfaces/react/src/components/Terminal.tsx)

```typescript
// Add collaboration UI
export const Terminal: React.FC<TerminalProps> = (props) => {
  const { activeUsers, comments } = useCollaboration();
  
  return (
    <Box flexDirection="column">
      {/* New: Presence indicator */}
      <PresenceIndicator users={activeUsers} />
      
      {/* Existing terminal display */}
      <StreamDisplay events={events} comments={comments} />
      
      {/* New: Comment sidebar (toggle with hotkey) */}
      {showComments && <CommentSidebar />}
    </Box>
  );
};
```

### 4. useEventStream Hook Integration

**Modification:** Update [`useEventStream`](boo/src/modules/interfaces/react/src/hooks/useEventStream.ts)

```typescript
// Add collaboration event handling
export const useEventStream = () => {
  const { broadcastCursor } = useCollaboration();
  
  const processEvent = (event: DisplayStreamEvent) => {
    // Existing processing
    
    // New: Update cursor position for other users
    broadcastCursor({ eventId: event.id, position: events.length });
  };
  
  return [state, actions];
};
```

### 5. Langfuse Integration

Leverage existing Langfuse infrastructure in [`docker-compose.yml`](boo/docker/docker-compose.yml):

- Use existing PostgreSQL for collaboration data
- Use existing Redis for presence/pub-sub
- Store collaboration traces in Langfuse for audit
- Link collaboration sessions to Langfuse traces

---

## Implementation Phases

### Phase 1: Foundation (2 weeks)
**Goal:** Core infrastructure and basic WebSocket connectivity

- [ ] Set up WebSocket server infrastructure
- [ ] Implement authentication middleware
- [ ] Create database schema and migrations
- [ ] Build SessionManager and basic session lifecycle
- [ ] Create WebSocket client library
- [ ] Implement basic connection/disconnection handling
- [ ] Write unit tests for core services

**Deliverables:**
- Working WebSocket server
- Database schema deployed
- Basic authentication flow
- Client can connect and authenticate

### Phase 2: Presence & Session Management (2 weeks)
**Goal:** User presence and session participant tracking

- [ ] Implement PresenceManager with Redis
- [ ] Build user presence UI component
- [ ] Add heartbeat mechanism
- [ ] Implement session join/leave flows
- [ ] Create activity logging
- [ ] Build ActivityFeed component
- [ ] Add presence indicators to Terminal

**Deliverables:**
- Real-time presence tracking
- User join/leave notifications
- Activity feed showing session events

### Phase 3: Event Streaming (2 weeks)
**Goal:** Real-time operation event broadcasting

- [ ] Integrate WebSocket server with ExecutionService
- [ ] Implement event broadcasting to session participants
- [ ] Add event buffering and replay for late joiners
- [ ] Update StreamDisplay to show collaboration metadata
- [ ] Implement cursor position tracking
- [ ] Add "User X is viewing line Y" indicators
- [ ] Performance optimization for high-frequency events

**Deliverables:**
- Real-time event streaming to all participants
- Event replay for new joiners
- Cursor position indicators

### Phase 4: Commenting System (2 weeks)
**Goal:** Collaborative commenting and annotations

- [ ] Implement CollaborationService comment methods
- [ ] Create comment database operations
- [ ] Build CommentSidebar component
- [ ] Add comment indicators to StreamDisplay
- [ ] Implement comment threading
- [ ] Add comment notifications
- [ ] Create comment search and filtering

**Deliverables:**
- Full commenting system
- Comment sidebar UI
- Real-time comment notifications

### Phase 5: Security & Access Control (1 week)
**Goal:** Production-ready security measures

- [ ] Implement role-based access control
- [ ] Add rate limiting
- [ ] Implement audit logging
- [ ] Add input validation and sanitization
- [ ] Set up WSS with TLS certificates
- [ ] Security testing and penetration testing
- [ ] Document security measures

**Deliverables:**
- Production-ready security
- Complete audit trail
- Security documentation

### Phase 6: Polish & Production (1 week)
**Goal:** Production readiness and documentation

- [ ] Performance optimization
- [ ] Error handling and recovery
- [ ] Comprehensive testing (unit, integration, e2e)
- [ ] User documentation
- [ ] Operator documentation
- [ ] Deployment scripts
- [ ] Monitoring and alerting setup

**Deliverables:**
- Production-ready system
- Complete documentation
- Deployment automation

---

## File Structure

```
boo/
├── src/
│   ├── modules/
│   │   ├── collaboration/                    # New collaboration backend
│   │   │   ├── __init__.py
│   │   │   ├── ws-server.ts                 # WebSocket server
│   │   │   ├── session-manager.ts           # Session lifecycle
│   │   │   ├── presence-manager.ts          # Presence tracking
│   │   │   ├── collab-service.ts            # Core service
│   │   │   ├── auth-middleware.ts           # Authentication
│   │   │   ├── models/                      # Data models
│   │   │   │   ├── session.ts
│   │   │   │   ├── comment.ts
│   │   │   │   ├── activity.ts
│   │   │   │   └── user.ts
│   │   │   └── utils/
│   │   │       ├── redis-client.ts
│   │   │       └── db-client.ts
│   │   │
│   │   └── interfaces/
│   │       └── react/
│   │           └── src/
│   │               ├── contexts/
│   │               │   └── CollaborationContext.tsx  # New context
│   │               │
│   │               ├── components/
│   │               │   ├── collaboration/          # New components
│   │               │   │   ├── PresenceIndicator.tsx
│   │               │   │   ├── CommentSidebar.tsx
│   │               │   │   ├── ActivityFeed.tsx
│   │               │   │   └── CommentThread.tsx
│   │               │   │
│   │               │   ├── StreamDisplay.tsx       # Modified
│   │               │   └── Terminal.tsx            # Modified
│   │               │
│   │               ├── hooks/
│   │               │   ├── useCollaboration.ts     # New hook
│   │               │   ├── usePresence.ts          # New hook
│   │               │   ├── useComments.ts          # New hook
│   │               │   └── useEventStream.ts       # Modified
│   │               │
│   │               ├── services/
│   │               │   ├── collaboration/          # New services
│   │               │   │   ├── ws-client.ts        # WebSocket client
│   │               │   │   └── collab-api.ts       # REST API client
│   │               │   │
│   │               │   ├── PythonExecutionService.ts    # Modified
│   │               │   └── DockerExecutionServiceAdapter.ts # Modified
│   │               │
│   │               └── types/
│   │                   └── collaboration.ts        # New types
│   │
│   └── migrations/
│       └── collaboration/                          # Database migrations
│           ├── 001_create_sessions.sql
│           ├── 002_create_comments.sql
│           ├── 003_create_activity_log.sql
│           └── 004_create_users.sql
│
├── docker/
│   └── docker-compose.yml                          # Modified (add collab server)
│
├── docs/
│   └── architecture/
│       ├── real-time-collaboration-design.md       # This document
│       └── collaboration-api.md                    # API documentation
│
└── tests/
    └── collaboration/                               # New tests
        ├── unit/
        ├── integration/
        └── e2e/
```

---

## Performance Considerations

### 1. Scalability

- **Horizontal Scaling:** WebSocket server can run multiple instances with Redis pub/sub
- **Connection Pooling:** Database connection pooling for high concurrency
- **Event Batching:** Batch events to reduce WebSocket message frequency
- **Caching:** Redis caching for frequently accessed data

### 2. Optimization Strategies

- **Event Compression:** Compress large events before transmission
- **Selective Broadcasting:** Only send events to users currently viewing them
- **Lazy Loading:** Load comments on-demand rather than upfront
- **Pagination:** Paginate activity logs and comment threads

### 3. Resource Limits

- **Max Connections per Session:** 50 concurrent viewers
- **Max Message Size:** 1 MB per WebSocket message
- **Event Buffer Size:** 1000 most recent events per session
- **Comment Size Limit:** 5000 characters per comment

---

## Monitoring & Observability

### 1. Metrics to Track

- Active WebSocket connections
- Messages per second
- Average message latency
- Connection establishment time
- Comment creation rate
- Session duration
- User presence updates per minute

### 2. Integration with Langfuse

- Track collaboration events as Langfuse spans
- Link comments to operation traces
- Monitor collaboration performance
- Alert on anomalies

### 3. Logging

- Structured logging for all collaboration events
- Correlation IDs across services
- Log levels: DEBUG, INFO, WARN, ERROR
- Log aggregation for search and analysis

---

## API Endpoints (REST)

In addition to WebSocket, provide REST API for:

### 1. Session Management
```
POST   /api/collaboration/sessions          # Create session
GET    /api/collaboration/sessions/:id      # Get session details
PATCH  /api/collaboration/sessions/:id      # Update session
DELETE /api/collaboration/sessions/:id      # End session
```

### 2. Comments
```
GET    /api/collaboration/sessions/:id/comments     # List comments
POST   /api/collaboration/sessions/:id/comments     # Add comment
PATCH  /api/collaboration/comments/:id              # Edit comment
DELETE /api/collaboration/comments/:id              # Delete comment
```

### 3. Activity
```
GET    /api/collaboration/sessions/:id/activity     # Get activity log
```

### 4. Users
```
GET    /api/collaboration/sessions/:id/participants # List participants
POST   /api/collaboration/sessions/:id/participants # Add participant
DELETE /api/collaboration/sessions/:id/participants/:userId # Remove
```

---

## Testing Strategy

### 1. Unit Tests
- Service layer logic
- Authentication and authorization
- Data models
- Utility functions

### 2. Integration Tests
- WebSocket message flow
- Database operations
- Redis pub/sub
- Execution service integration

### 3. E2E Tests
- Multi-user collaboration scenarios
- Comment lifecycle
- Presence updates
- Event streaming

### 4. Load Tests
- Connection scaling (1000+ concurrent users)
- Message throughput
- Database performance under load
- Redis performance

---

## Deployment

### 1. Docker Compose Update

Add collaboration server to [`docker-compose.yml`](boo/docker/docker-compose.yml):

```yaml
services:
  collaboration:
    build:
      context: ../
      dockerfile: docker/Dockerfile.collaboration
    container_name: boo-collaboration
    ports:
      - "8080:8080"  # WebSocket server
      - "8081:8081"  # REST API
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/postgres
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
    networks:
      - default
```

### 2. Environment Variables

```bash
# Collaboration Server
COLLAB_WS_PORT=8080
COLLAB_API_PORT=8081
JWT_SECRET=your-secret-key
JWT_EXPIRATION=15m
REFRESH_TOKEN_EXPIRATION=7d

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379

# Security
ENABLE_TLS=true
TLS_CERT_PATH=/path/to/cert.pem
TLS_KEY_PATH=/path/to/key.pem

# Limits
MAX_CONNECTIONS_PER_SESSION=50
MAX_MESSAGE_SIZE=1048576
HEARTBEAT_INTERVAL=30000
```

---

## Migration Path

### For Existing Operations

1. **Backward Compatibility:** Ensure all existing functionality works without collaboration
2. **Optional Feature:** Collaboration is opt-in per operation
3. **Gradual Rollout:** Enable for beta users first
4. **Data Migration:** No migration needed - new schema is additive

### Enabling Collaboration

```typescript
// Start operation with collaboration
const operationManager = new OperationManager();
const session = await operationManager.startWithCollaboration({
  target: 'example.com',
  objective: 'Penetration test',
  enableCollaboration: true,  // New option
  allowedUsers: ['user1', 'user2']  // Optional whitelist
});
```

---

## Future Enhancements

### Phase 7+: Advanced Features

1. **Video/Audio Chat Integration**
   - WebRTC for voice communication
   - Screen sharing for demonstrations

2. **Replay Mode**
   - Replay past operations with comments
   - Timeline scrubbing
   - Export to video

3. **Advanced Collaboration**
   - Real-time collaborative editing of scripts
   - Shared workspace for notes
   - Voting on findings

4. **Mobile Apps**
   - iOS and Android clients
   - Push notifications
   - Offline mode with sync

5. **AI Assistant**
   - AI-powered comment suggestions
   - Automated finding classification
   - Smart notifications

---

## Conclusion

This design provides a comprehensive real-time collaboration system for the Boo security assessment tool. The architecture leverages existing infrastructure (Langfuse stack), integrates seamlessly with current components, and provides a path for incremental implementation.

Key benefits:
- ✅ Real-time multi-user collaboration
- ✅ Scalable WebSocket architecture
- ✅ Secure by design with RBAC
- ✅ Seamless integration with existing code
- ✅ Production-ready security measures
- ✅ Comprehensive audit trail

The phased implementation approach allows for iterative development and testing, ensuring quality at each stage.

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-13  
**Status:** Ready for Review  
**Next Steps:** Review with team → Begin Phase 1 implementation
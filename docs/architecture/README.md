# Boo Security Assessment Tool - Architecture Documentation

This directory contains architectural design documents for the Boo security assessment tool.

---

## Real-Time Collaboration System

### 📋 Documentation Index

1. **[Real-Time Collaboration Design](./real-time-collaboration-design.md)** - Complete architectural design
   - System architecture and component diagrams
   - WebSocket protocol specification
   - Database schema and data models
   - Frontend component hierarchy
   - Backend service architecture
   - Security and authentication flow
   - Implementation phases (6 phases, 10 weeks)
   - Complete file structure

2. **[Collaboration Quick Reference](./collaboration-quick-reference.md)** - Developer quick-start guide
   - Quick start code examples
   - Core component reference
   - WebSocket message formats
   - Database and Redis patterns
   - Configuration guide
   - Troubleshooting tips

---

## Real-Time Collaboration System Overview

### What It Does

Enables multiple team members to simultaneously:
- **View** live security assessment operations in real-time
- **Comment** on events, findings, and specific output lines
- **Track** who's viewing the operation (presence awareness)
- **Collaborate** through shared annotations and activity feeds
- **Audit** all collaboration activities for compliance

### Key Features

✅ **Real-time Operation Sharing** - Stream security assessment events to multiple viewers  
✅ **Live Commenting** - Annotate events, findings, and output in real-time  
✅ **Presence Awareness** - See who's online with live status indicators  
✅ **Activity Tracking** - Complete audit trail of all collaboration actions  
✅ **Progress Synchronization** - All viewers see identical operation state  
✅ **Role-Based Access** - Granular permissions (viewer, commenter, operator, admin)  
✅ **Secure by Design** - WSS encryption, JWT authentication, RBAC authorization  

### Architecture Highlights

```
Frontend (React/Ink)
    ↓
WebSocket Client (ws-client.ts)
    ↓ WSS
Collaboration Server (Node.js)
    ├── Session Manager
    ├── Presence Manager
    └── Collaboration Service
    ↓
Data Layer (PostgreSQL + Redis + Langfuse)
```

### Technology Stack

**Backend:**
- Node.js with TypeScript
- WebSocket Server (ws library)
- PostgreSQL for persistent data
- Redis for presence and pub/sub
- JWT for authentication

**Frontend:**
- React with TypeScript
- Existing Ink terminal components
- Context API for state management
- Custom hooks for collaboration features

**Infrastructure:**
- Docker Compose for deployment
- Existing Langfuse stack integration
- TLS/WSS for secure communications

---

## Design Decisions

### 1. WebSocket Over HTTP Polling
**Rationale:** Real-time bidirectional communication with lower latency and overhead

### 2. PostgreSQL for Persistent Data
**Rationale:** Leverage existing Langfuse stack, ACID compliance for audit trail

### 3. Redis for Presence/Pub-Sub
**Rationale:** Fast in-memory operations, built-in pub/sub for event broadcasting

### 4. JWT Authentication
**Rationale:** Stateless, secure, industry standard for API authentication

### 5. Role-Based Access Control
**Rationale:** Flexible permissions system for different user types

### 6. Event Integration via ExecutionService
**Rationale:** Minimal changes to existing architecture, clean separation of concerns

---

## Integration Points

The collaboration system integrates seamlessly with existing Boo components:

### Execution Services
- [`PythonExecutionService.ts`](../../src/modules/interfaces/react/src/services/PythonExecutionService.ts) - Broadcasts events to collaboration sessions
- [`DockerExecutionServiceAdapter.ts`](../../src/modules/interfaces/react/src/services/DockerExecutionServiceAdapter.ts) - Docker container event streaming

### UI Components
- [`StreamDisplay.tsx`](../../src/modules/interfaces/react/src/components/StreamDisplay.tsx) - Displays comments and presence
- [`Terminal.tsx`](../../src/modules/interfaces/react/src/components/Terminal.tsx) - Hosts collaboration UI elements

### Event System
- [`useEventStream.ts`](../../src/modules/interfaces/react/src/hooks/useEventStream.ts) - Cursor position tracking
- Event types from [`events.ts`](../../src/modules/interfaces/react/src/types/events.ts)

### Infrastructure
- [`docker-compose.yml`](../../docker/docker-compose.yml) - Langfuse stack (PostgreSQL, Redis)

---

## Implementation Timeline

### Phase 1: Foundation (2 weeks)
Core infrastructure, WebSocket server, authentication, database schema

### Phase 2: Presence & Sessions (2 weeks)
User presence tracking, session management, activity logging

### Phase 3: Event Streaming (2 weeks)
Real-time event broadcasting, cursor tracking, replay functionality

### Phase 4: Commenting System (2 weeks)
Comment creation/editing, threading, notifications

### Phase 5: Security & Access Control (1 week)
RBAC, rate limiting, security hardening, audit logging

### Phase 6: Production Ready (1 week)
Performance optimization, testing, documentation, deployment

**Total Timeline:** 10 weeks for production-ready system

---

## Security Considerations

### Authentication
- JWT tokens with 15-minute expiration
- Refresh token rotation
- Token revocation list in Redis

### Authorization
- Role-based access control (RBAC)
- Session-level permissions
- Operation-level access control

### Transport Security
- WSS (WebSocket Secure) only in production
- TLS 1.3 minimum
- Certificate validation

### Data Protection
- Encrypted data at rest
- PII masking in logs
- Complete audit trail

### Rate Limiting
- Per-user connection limits
- Message rate limits (100/min)
- Comment creation limits (10/min)

---

## Performance Characteristics

### Scalability
- **Horizontal Scaling:** Multiple WebSocket server instances with Redis pub/sub
- **Connection Capacity:** 50 concurrent viewers per session
- **Event Throughput:** 1000+ events/second with batching
- **Latency:** < 50ms event propagation with Redis

### Resource Limits
- Max connections per session: 50
- Max message size: 1 MB
- Event buffer: 1000 most recent events
- Comment size: 5000 characters

---

## Testing Strategy

### Unit Tests
- Service layer logic
- Authentication/authorization
- Data models
- Utility functions

### Integration Tests
- WebSocket message flow
- Database operations
- Redis pub/sub
- ExecutionService integration

### End-to-End Tests
- Multi-user scenarios
- Comment lifecycle
- Presence updates
- Event streaming

### Load Tests
- 1000+ concurrent connections
- High message throughput
- Database performance
- Redis performance

---

## Deployment

### Docker Compose
Add collaboration server to existing stack:

```yaml
collaboration:
  image: boo-collaboration:latest
  ports:
    - "8080:8080"  # WebSocket
    - "8081:8081"  # REST API
  environment:
    - DATABASE_URL=${DATABASE_URL}
    - REDIS_URL=${REDIS_URL}
    - JWT_SECRET=${JWT_SECRET}
  depends_on:
    - postgres
    - redis
```

### Environment Variables
```bash
COLLAB_WS_PORT=8080
COLLAB_API_PORT=8081
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

---

## Migration Path

### Backward Compatibility
- All existing functionality works without collaboration
- Collaboration is opt-in per operation
- No breaking changes to current API

### Enabling Collaboration
```typescript
const session = await operationManager.startWithCollaboration({
  target: 'example.com',
  objective: 'Penetration test',
  enableCollaboration: true,
  allowedUsers: ['alice', 'bob']
});
```

### Gradual Rollout
1. Deploy collaboration infrastructure
2. Enable for beta users
3. Gather feedback and iterate
4. General availability rollout

---

## Future Enhancements

### Phase 7+ Ideas
- **Video/Audio Chat:** WebRTC integration for voice communication
- **Replay Mode:** Time-travel through past operations
- **Collaborative Editing:** Real-time script editing
- **Mobile Apps:** iOS and Android native clients
- **AI Assistant:** AI-powered comment suggestions and finding classification

---

## Getting Started

### For Developers
1. Read the [full design document](./real-time-collaboration-design.md)
2. Review the [quick reference guide](./collaboration-quick-reference.md)
3. Check out the implementation phases
4. Set up your development environment
5. Start with Phase 1 foundation work

### For Operations Teams
1. Review security requirements
2. Plan infrastructure deployment
3. Configure authentication
4. Set up monitoring
5. Plan user training

### For Security Teams
1. Review security architecture
2. Validate authentication flows
3. Audit access control implementation
4. Test rate limiting and protections
5. Verify audit logging

---

## Documentation Status

| Document | Status | Version | Last Updated |
|----------|--------|---------|--------------|
| Real-Time Collaboration Design | ✅ Complete | 1.0 | 2025-12-13 |
| Collaboration Quick Reference | ✅ Complete | 1.0 | 2025-12-13 |
| API Specification | 📋 Included | 1.0 | 2025-12-13 |
| Database Schema | 📋 Included | 1.0 | 2025-12-13 |

---

## Key Contacts

- **Architecture Questions:** Review design documents or contact development team
- **Implementation Questions:** See quick reference guide
- **Security Questions:** Review security section in main design
- **Deployment Questions:** See deployment section

---

## Version History

### v1.0 (2025-12-13)
- Initial architectural design
- Complete system architecture
- WebSocket protocol specification
- Database schema design
- Frontend component design
- Backend service architecture
- Security and authentication design
- 6-phase implementation plan
- Quick reference guide

---

## Related Documentation

- [Boo Main README](../../README.md)
- [React Interface Documentation](../../src/modules/interfaces/react/README.md)
- [Langfuse Integration](../../docker/docker-compose.yml)

---

**Architecture Version:** 1.0  
**Last Updated:** 2025-12-13  
**Status:** Design Complete - Ready for Implementation  
**Next Step:** Begin Phase 1 Implementation
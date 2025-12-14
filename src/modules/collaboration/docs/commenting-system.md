# Phase 4: Commenting System Documentation

## Overview

Phase 4 implements a production-ready commenting system that enables rich team collaboration during security operations. Team members can add comments to specific events, tool executions, and findings, creating threaded discussions with @mentions, reactions, and version history.

## Architecture

### Core Components

1. **CommentRepository** - Database layer for comments, reactions, versions, and mentions
2. **CommentService** - Business logic for comment operations and permissions
3. **NotificationService** - Real-time notifications for mentions and replies
4. **WebSocket Handlers** - Real-time comment delivery via WebSocket
5. **Database Schema** - PostgreSQL tables with triggers for automation

### Data Model

```
comments
├── id (UUID)
├── session_id (UUID, FK to collaboration_sessions)
├── author_id (UUID, FK to users)
├── parent_id (UUID, FK to comments) - for threading
├── target_type (event|finding|line|tool_execution)
├── target_id (string)
├── event_id (string, optional)
├── content (text)
├── metadata (JSONB)
├── created_at
├── updated_at
├── deleted_at (soft delete)

comment_reactions
├── id (UUID)
├── comment_id (UUID, FK to comments)
├── user_id (UUID, FK to users)
├── reaction_type (like|flag|resolve|question)
├── created_at

comment_versions
├── id (UUID)
├── comment_id (UUID, FK to comments)
├── version (integer)
├── content (text)
├── edited_by (UUID, FK to users)
├── edited_at

comment_mentions
├── id (UUID)
├── comment_id (UUID, FK to comments)
├── mentioned_user_id (UUID, FK to users)
├── notified (boolean)
├── created_at

notifications
├── id (UUID)
├── user_id (UUID, FK to users)
├── type (mention|reply|reaction)
├── comment_id (UUID, FK to comments)
├── session_id (UUID, FK to collaboration_sessions)
├── from_user_id (UUID, FK to users)
├── message (text)
├── is_read (boolean)
├── created_at
├── read_at
```

## Features

### 1. Comment Creation

Create comments with threading support:

```typescript
// Client sends
{
  type: 'comment.create',
  sessionId: 'session-123',
  targetType: 'event',
  targetId: 'evt-456',
  eventId: 'evt-456',
  content: 'This looks like a SQL injection attempt. @alice can you verify?',
  parentId: null, // or parent comment ID for replies
  metadata: {
    severity: 'warning',
    tags: ['security', 'sql-injection']
  }
}

// Server broadcasts to all participants
{
  type: 'comment.created',
  comment: {
    id: 'cmt-789',
    sessionId: 'session-123',
    authorId: 'usr-111',
    author: {
      userId: 'usr-111',
      username: 'bob',
      fullName: 'Bob Smith',
      role: 'operator'
    },
    targetType: 'event',
    targetId: 'evt-456',
    eventId: 'evt-456',
    content: 'This looks like a SQL injection attempt. @alice can you verify?',
    metadata: { severity: 'warning', tags: ['security', 'sql-injection'] },
    reactions: [],
    replyCount: 0,
    mentions: ['alice'],
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z'
  },
  sessionId: 'session-123',
  timestamp: 1705315800000
}
```

### 2. Comment Editing

Edit comments with automatic version history:

```typescript
// Client sends
{
  type: 'comment.edit',
  commentId: 'cmt-789',
  content: 'Updated: This is definitely a SQL injection attempt. @alice please verify ASAP.',
  sessionId: 'session-123'
}

// Server broadcasts
{
  type: 'comment.edited',
  comment: { /* updated comment with new content */ },
  previousVersion: {
    id: 'ver-001',
    commentId: 'cmt-789',
    version: 1,
    content: 'This looks like a SQL injection attempt. @alice can you verify?',
    editedAt: '2024-01-15T10:30:00Z',
    editedBy: 'bob'
  },
  sessionId: 'session-123',
  timestamp: 1705315860000
}
```

### 3. Comment Deletion

Soft delete comments (preserves audit trail):

```typescript
// Client sends
{
  type: 'comment.delete',
  commentId: 'cmt-789',
  sessionId: 'session-123'
}

// Server broadcasts
{
  type: 'comment.deleted',
  commentId: 'cmt-789',
  sessionId: 'session-123',
  timestamp: 1705315920000
}
```

### 4. Reactions

Add or remove reactions (like, flag, resolve, question):

```typescript
// Client sends
{
  type: 'comment.react',
  commentId: 'cmt-789',
  reactionType: 'like',
  sessionId: 'session-123'
}

// Server broadcasts (reaction added)
{
  type: 'comment.reaction',
  commentId: 'cmt-789',
  reaction: {
    id: 'rxn-001',
    commentId: 'cmt-789',
    userId: 'usr-222',
    username: 'alice',
    reactionType: 'like',
    createdAt: '2024-01-15T10:31:00Z'
  },
  sessionId: 'session-123',
  timestamp: 1705315860000
}

// Server broadcasts (reaction removed - toggled off)
{
  type: 'comment.reaction',
  commentId: 'cmt-789',
  reaction: null,
  sessionId: 'session-123',
  timestamp: 1705315920000
}
```

### 5. Comment Queries

Query comments with filters:

```typescript
// Client sends
{
  type: 'comment.query',
  sessionId: 'session-123',
  eventId: 'evt-456', // optional
  targetType: 'event', // optional
  targetId: 'evt-456', // optional
  includeDeleted: false // optional
}

// Server sends to requester only
{
  type: 'comments.result',
  comments: [
    { /* comment 1 */ },
    { /* comment 2 */ },
    // ...
  ],
  sessionId: 'session-123',
  timestamp: 1705315800000
}
```

### 6. Mention Notifications

Automatic notifications when users are mentioned:

```typescript
// Server sends to mentioned user
{
  type: 'notification',
  notification: {
    id: 'ntf-001',
    userId: 'usr-222',
    type: 'mention',
    commentId: 'cmt-789',
    sessionId: 'session-123',
    fromUserId: 'usr-111',
    fromUsername: 'bob',
    message: 'bob mentioned you in a comment',
    isRead: false,
    createdAt: '2024-01-15T10:30:00Z'
  },
  timestamp: 1705315800000
}

// Client marks as read
{
  type: 'notification.read',
  notificationId: 'ntf-001'
}
```

## Security & Permissions

### Permission Model

Comments respect the collaboration session permission model:

- **Viewer** - Can view comments but cannot add, edit, or react
- **Commenter** - Can add comments, edit own comments, and react
- **Operator** - Full permissions including moderation (delete any comment)

### Input Sanitization

All comment content is sanitized to prevent XSS attacks:

- Script tags removed
- Iframe tags removed
- `javascript:` protocol removed
- Event handlers removed

### Rate Limiting

Comments are rate-limited to prevent spam:

- Default: 10 comments per minute per user
- Configurable via `COLLAB_COMMENT_RATE_LIMIT`
- Rate limit window: 60 seconds (configurable)

## Performance

### Database Optimization

- Indexes on `session_id`, `author_id`, `parent_id`, `target_type`, `event_id`
- Composite index on `(session_id, parent_id, created_at)` for thread queries
- GIN index on `metadata` JSONB for flexible querying
- Efficient recursive CTE for thread reconstruction

### Query Performance

- Comment loading: < 200ms for 100 comments
- Real-time delivery: < 100ms
- Thread reconstruction: < 150ms for 50-level deep threads
- Pagination: 50 comments per page (configurable)

### Caching Strategy

- No caching at database layer (real-time consistency)
- Client-side caching for loaded comments
- WebSocket for real-time updates

## Threading & Nesting

Comments support unlimited nesting depth via `parent_id`:

```
Comment 1 (root)
├── Comment 2 (reply to 1)
│   ├── Comment 3 (reply to 2)
│   └── Comment 4 (reply to 2)
└── Comment 5 (reply to 1)
```

Threads are reconstructed efficiently using PostgreSQL recursive CTEs.

## Version History

Every edit creates a new version entry:

- Version 1: Original content
- Version 2: First edit
- Version 3: Second edit
- etc.

Versions are created automatically by database trigger when content changes.

## Moderation

### Operator Moderation

Operators can:
- Delete any comment (soft delete preserves audit trail)
- View comment history
- View flagged comments

### Auto-Moderation

- Comments with >= 3 flags are auto-hidden
- Configurable via `COLLAB_MODERATION_AUTO_FLAG_THRESHOLD`
- Manual approval workflow (optional)

## Notification System

### Notification Types

1. **Mention** - User is @mentioned in a comment
2. **Reply** - Someone replies to user's comment
3. **Reaction** - Someone reacts to user's comment (future)

### Delivery Methods

1. **Real-time** - WebSocket message (enabled by default)
2. **Email Digest** - Daily/weekly summary (configurable, disabled by default)

### Notification Queries

```typescript
// Get unread notifications
const unread = await notificationService.getUserNotifications(userId, true);

// Get unread count
const count = await notificationService.getUnreadCount(userId);

// Get recent notifications
const recent = await notificationService.getRecentNotifications(userId, 10);

// Mark as read
await notificationService.markAsRead(notificationId, userId);

// Mark all as read
await notificationService.markAllAsRead(userId);
```

## Configuration

### Environment Variables

```bash
# Comment rate limiting
COLLAB_COMMENT_RATE_LIMIT=10
COLLAB_COMMENT_RATE_WINDOW_MS=60000
COLLAB_COMMENT_MAX_LENGTH=5000
COLLAB_COMMENT_PAGINATION_LIMIT=50

# Notifications
COLLAB_NOTIFICATION_REALTIME=true
COLLAB_NOTIFICATION_EMAIL_DIGEST=false
COLLAB_NOTIFICATION_EMAIL_INTERVAL_HOURS=24
COLLAB_NOTIFICATION_MAX_PER_QUERY=100

# Moderation
COLLAB_MODERATION_ENABLED=true
COLLAB_MODERATION_AUTO_FLAG_THRESHOLD=3
COLLAB_MODERATION_REQUIRE_APPROVAL=false

# Retention
COLLAB_COMMENT_RETENTION_DAYS=365
COLLAB_COMMENT_SOFT_DELETE=true
COLLAB_COMMENT_VERSION_HISTORY=true
COLLAB_COMMENT_MAX_VERSIONS=10
```

## Usage Examples

### Backend Service Usage

```typescript
import { CommentService } from './services/CommentService';
import { NotificationService } from './services/NotificationService';
import { CommentRepository } from './repositories/CommentRepository';

// Initialize services
const commentRepo = new CommentRepository(dbClient);
const commentService = new CommentService(commentRepo, sessionManager);
const notificationService = new NotificationService(commentRepo);

// Create comment
const comment = await commentService.createComment(
  'session-123',
  'usr-111',
  'event',
  'evt-456',
  'This is a security finding @alice',
  'evt-456',
  null,
  { severity: 'high' }
);

// Edit comment
const updated = await commentService.editComment(
  'cmt-789',
  'Updated content',
  'usr-111'
);

// React to comment
const reaction = await commentService.reactToComment(
  'cmt-789',
  'usr-222',
  'like'
);

// Get comments
const comments = await commentService.getComments(
  'session-123',
  'usr-111',
  { eventId: 'evt-456' }
);

// Get thread
const thread = await commentService.getCommentThread('cmt-789', 'usr-111');

// Get notifications
const notifications = await notificationService.getUserNotifications('usr-222', true);
```

### React Hook Usage

```typescript
import { useCollaboration } from './hooks/useCollaboration';

function MyComponent() {
  const {
    addComment,
    editComment,
    deleteComment,
    reactToComment,
    comments,
    notifications,
    markNotificationRead
  } = useCollaboration(sessionId);

  // Add comment
  const handleAddComment = async (content: string, eventId: string) => {
    await addComment(eventId, content, 'event', eventId);
  };

  // Edit comment
  const handleEdit = async (commentId: string, newContent: string) => {
    await editComment(commentId, newContent);
  };

  // React
  const handleReact = async (commentId: string) => {
    await reactToComment(commentId, 'like');
  };

  return (
    <div>
      <NotificationBell 
        notifications={notifications}
        onRead={markNotificationRead}
      />
      <CommentThread
        comments={comments}
        onReply={handleAddComment}
        onEdit={handleEdit}
        onReact={handleReact}
      />
    </div>
  );
}
```

## Database Triggers

### Version History Trigger

Automatically creates version entry when comment content changes:

```sql
CREATE TRIGGER save_comment_version_trigger
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION save_comment_version();
```

### Mention Notification Trigger

Automatically detects @mentions and creates notifications:

```sql
CREATE TRIGGER process_mentions_trigger
    AFTER INSERT ON comments
    FOR EACH ROW
    EXECUTE FUNCTION process_comment_mentions();
```

## Best Practices

### 1. Comment Organization

- Use target types to categorize comments
- Use metadata for flexible tagging
- Keep comments focused and concise
- Use threads for related discussions

### 2. Mention Usage

- @ mention users who need to see specific comments
- Don't overuse mentions (causes notification fatigue)
- Use clear, actionable language in mentions

### 3. Reactions

- Use `like` for agreement/acknowledgment
- Use `flag` to mark for review
- Use `resolve` to mark issues as addressed
- Use `question` to indicate need for clarification

### 4. Moderation

- Review flagged comments promptly
- Provide clear moderation guidelines
- Use soft delete to preserve audit trail
- Document moderation decisions

## Monitoring & Metrics

### Key Metrics

- Comments per session
- Average thread depth
- Mention notification delivery time
- Comment load performance
- Rate limit violations

### Health Checks

- Database connection status
- WebSocket connectivity
- Notification delivery success rate
- Comment creation latency

## Troubleshooting

### Common Issues

1. **Comments not appearing**
   - Check WebSocket connection
   - Verify user has comment permission
   - Check rate limiting

2. **Notifications not delivered**
   - Verify notification service is enabled
   - Check WebSocket connectivity
   - Verify user is mentioned correctly

3. **Slow comment loading**
   - Check database indexes
   - Review pagination settings
   - Monitor database connection pool

4. **Permission errors**
   - Verify user role in session
   - Check session participant list
   - Review permission configuration

## Future Enhancements

- [ ] Rich text formatting (markdown, code blocks)
- [ ] File attachments
- [ ] Comment templates
- [ ] Advanced search (full-text search)
- [ ] Comment analytics
- [ ] AI-powered comment suggestions
- [ ] Comment translation
- [ ] Reaction analytics
- [ ] Custom reaction types
- [ ] Comment export

## API Reference

See [`types/index.ts`](../types/index.ts) for complete type definitions.

### Key Interfaces

- `Comment` - Base comment entity
- `CommentWithAuthor` - Comment with author details and reactions
- `CommentReaction` - Reaction to a comment
- `CommentVersion` - Comment version history entry
- `Notification` - User notification
- `CommentCreateMessage` - WebSocket message for creating comments
- `CommentEditedMessage` - WebSocket broadcast for edited comments
- `CommentReactionMessage` - WebSocket broadcast for reactions
- `NotificationMessage` - WebSocket notification delivery

## Migration Guide

### From Basic Comments (Pre-Phase 4)

1. Run database migration: `psql -f database/schema.sql`
2. Update configuration with Phase 4 settings
3. Update client code to use new message types
4. Test comment creation, editing, reactions
5. Verify notifications are delivered

### Breaking Changes

- Comment message types changed from `comment_add` to `comment.create`
- Comment edit now includes version history
- Reactions are now toggled (add/remove with same message)
- Notifications are delivered via separate message type

## Support

For issues or questions:
- Check troubleshooting section above
- Review API documentation
- Check database logs for errors
- Monitor WebSocket connection status
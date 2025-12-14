/**
 * Test Fixtures
 * 
 * Common test data and fixtures used across tests
 */

export const TEST_JWT_CONFIG = {
  secret: 'test-secret-key-at-least-32-characters-long-for-jwt-testing',
  expiresIn: '1h',
  refreshExpiresIn: '7d',
  issuer: 'test-issuer',
  audience: 'test-audience',
};

export const TEST_DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: 'collaboration_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

export const TEST_REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: 1,
};

export const TEST_USERS = {
  admin: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'test_admin',
    email: 'admin@test.com',
    password: 'AdminPass123!',
    password_hash: '$2b$10$test_hash_admin',
    full_name: 'Test Admin',
    role: 'admin' as const,
    status: 'active' as const,
  },
  operator: {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'test_operator',
    email: 'operator@test.com',
    password: 'OperatorPass123!',
    password_hash: '$2b$10$test_hash_operator',
    full_name: 'Test Operator',
    role: 'operator' as const,
    status: 'active' as const,
  },
  analyst: {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'test_analyst',
    email: 'analyst@test.com',
    password: 'AnalystPass123!',
    password_hash: '$2b$10$test_hash_analyst',
    full_name: 'Test Analyst',
    role: 'analyst' as const,
    status: 'active' as const,
  },
  viewer: {
    id: '44444444-4444-4444-4444-444444444444',
    username: 'test_viewer',
    email: 'viewer@test.com',
    password: 'ViewerPass123!',
    password_hash: '$2b$10$test_hash_viewer',
    full_name: 'Test Viewer',
    role: 'viewer' as const,
    status: 'active' as const,
  },
  inactive: {
    id: '55555555-5555-5555-5555-555555555555',
    username: 'test_inactive',
    email: 'inactive@test.com',
    password: 'InactivePass123!',
    password_hash: '$2b$10$test_hash_inactive',
    full_name: 'Test Inactive User',
    role: 'analyst' as const,
    status: 'inactive' as const,
  },
};

export const TEST_SESSIONS = {
  active: {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    paper_id: 'paper_001',
    title: 'Test Active Session',
    status: 'active' as const,
  },
  completed: {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    paper_id: 'paper_002',
    title: 'Test Completed Session',
    status: 'completed' as const,
  },
  archived: {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    paper_id: 'paper_003',
    title: 'Test Archived Session',
    status: 'archived' as const,
  },
};

export const TEST_COMMENTS = {
  root: {
    id: 'comment_001',
    content: 'This is a root comment',
    author_id: TEST_USERS.analyst.id,
    session_id: TEST_SESSIONS.active.id,
    parent_comment_id: null,
    status: 'active' as const,
  },
  reply: {
    id: 'comment_002',
    content: 'This is a reply to root comment',
    author_id: TEST_USERS.operator.id,
    session_id: TEST_SESSIONS.active.id,
    parent_comment_id: 'comment_001',
    status: 'active' as const,
  },
  deleted: {
    id: 'comment_003',
    content: 'This comment was deleted',
    author_id: TEST_USERS.viewer.id,
    session_id: TEST_SESSIONS.active.id,
    parent_comment_id: null,
    status: 'deleted' as const,
  },
};

export const TEST_EVENTS = {
  sessionJoined: {
    type: 'session:joined' as const,
    userId: TEST_USERS.analyst.id,
    sessionId: TEST_SESSIONS.active.id,
    timestamp: new Date().toISOString(),
  },
  commentCreated: {
    type: 'comment:created' as const,
    userId: TEST_USERS.analyst.id,
    sessionId: TEST_SESSIONS.active.id,
    commentId: TEST_COMMENTS.root.id,
    timestamp: new Date().toISOString(),
  },
  presenceUpdated: {
    type: 'presence:updated' as const,
    userId: TEST_USERS.operator.id,
    status: 'active' as const,
    timestamp: new Date().toISOString(),
  },
};

export const TEST_NOTIFICATIONS = {
  mention: {
    type: 'mention' as const,
    recipient_id: TEST_USERS.operator.id,
    sender_id: TEST_USERS.analyst.id,
    content: 'You were mentioned in a comment',
    comment_id: TEST_COMMENTS.root.id,
    status: 'unread' as const,
  },
  reply: {
    type: 'reply' as const,
    recipient_id: TEST_USERS.analyst.id,
    sender_id: TEST_USERS.operator.id,
    content: 'Someone replied to your comment',
    comment_id: TEST_COMMENTS.reply.id,
    status: 'unread' as const,
  },
};

export const TEST_WEBSOCKET_MESSAGES = {
  join: {
    type: 'session:join',
    sessionId: TEST_SESSIONS.active.id,
  },
  leave: {
    type: 'session:leave',
    sessionId: TEST_SESSIONS.active.id,
  },
  comment: {
    type: 'comment:create',
    sessionId: TEST_SESSIONS.active.id,
    content: 'Test comment via WebSocket',
  },
  presence: {
    type: 'presence:update',
    status: 'active',
  },
};

/**
 * Get a fresh copy of test user (to avoid mutation)
 */
export function getTestUser(role: keyof typeof TEST_USERS) {
  return { ...TEST_USERS[role] };
}

/**
 * Get a fresh copy of test session (to avoid mutation)
 */
export function getTestSession(type: keyof typeof TEST_SESSIONS) {
  return { ...TEST_SESSIONS[type] };
}

/**
 * Get a fresh copy of test comment (to avoid mutation)
 */
export function getTestComment(type: keyof typeof TEST_COMMENTS) {
  return { ...TEST_COMMENTS[type] };
}

/**
 * Generate test data with custom overrides
 */
export function generateTestData<T>(base: T, overrides: Partial<T> = {}): T {
  return { ...base, ...overrides };
}
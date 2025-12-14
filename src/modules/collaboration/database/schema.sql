-- ============================================================================
-- Real-Time Collaboration System - Database Schema
-- ============================================================================
-- 
-- This schema defines all tables required for the real-time collaboration
-- system in the Boo security assessment tool.
--
-- Requirements:
--   - PostgreSQL 12 or higher
--   - UUID extension enabled
--
-- Usage:
--   psql -U <user> -d <database> -f schema.sql
--
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Table: users
-- Description: Core user accounts for the system
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
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
    CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ============================================================================
-- Table: collaboration_sessions
-- Description: Tracks collaboration sessions for security operations
-- ============================================================================

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
    CONSTRAINT valid_session_status CHECK (status IN ('active', 'completed', 'failed'))
);

-- Indexes for collaboration_sessions table
CREATE INDEX idx_collab_sessions_operation_id ON collaboration_sessions(operation_id);
CREATE INDEX idx_collab_sessions_session_id ON collaboration_sessions(session_id);
CREATE INDEX idx_collab_sessions_owner_id ON collaboration_sessions(owner_id);
CREATE INDEX idx_collab_sessions_status ON collaboration_sessions(status);
CREATE INDEX idx_collab_sessions_start_time ON collaboration_sessions(start_time DESC);
CREATE INDEX idx_collab_sessions_metadata ON collaboration_sessions USING GIN(metadata);

-- ============================================================================
-- Table: session_participants
-- Description: Tracks users participating in collaboration sessions
-- ============================================================================

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
    CONSTRAINT unique_session_user UNIQUE (session_id, user_id)
);

-- Indexes for session_participants table
CREATE INDEX idx_participants_session_id ON session_participants(session_id);
CREATE INDEX idx_participants_user_id ON session_participants(user_id);
CREATE INDEX idx_participants_session_user ON session_participants(session_id, user_id);
CREATE INDEX idx_participants_joined_at ON session_participants(joined_at DESC);
CREATE INDEX idx_participants_active ON session_participants(session_id) WHERE left_at IS NULL;

-- ============================================================================
-- Table: comments
-- Description: Stores comments on events, findings, and code lines
-- ============================================================================

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    author_id UUID NOT NULL,
    parent_id UUID,
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    event_id VARCHAR(255),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_comment_session FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
    CONSTRAINT valid_target_type CHECK (target_type IN ('event', 'finding', 'line', 'tool_execution'))
);

-- Indexes for comments table
CREATE INDEX idx_comments_session_id ON comments(session_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_target ON comments(target_type, target_id);
CREATE INDEX idx_comments_event_id ON comments(event_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);
CREATE INDEX idx_comments_active ON comments(session_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_metadata ON comments USING GIN(metadata);
CREATE INDEX idx_comments_thread ON comments(session_id, parent_id, created_at);

-- ============================================================================
-- Table: comment_reactions
-- Description: Reactions to comments (like, flag, resolve, question) - Phase 4
-- ============================================================================

CREATE TABLE comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL,
    user_id UUID NOT NULL,
    reaction_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_reaction_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_reaction_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT valid_reaction_type CHECK (reaction_type IN ('like', 'flag', 'resolve', 'question')),
    CONSTRAINT unique_user_comment_reaction UNIQUE (comment_id, user_id, reaction_type)
);

-- Indexes for comment_reactions table
CREATE INDEX idx_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX idx_reactions_user_id ON comment_reactions(user_id);
CREATE INDEX idx_reactions_type ON comment_reactions(reaction_type);

-- ============================================================================
-- Table: comment_versions
-- Description: Version history for edited comments - Phase 4
-- ============================================================================

CREATE TABLE comment_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    edited_by UUID NOT NULL,
    edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_version_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_version_editor FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_comment_version UNIQUE (comment_id, version)
);

-- Indexes for comment_versions table
CREATE INDEX idx_versions_comment_id ON comment_versions(comment_id, version DESC);
CREATE INDEX idx_versions_edited_at ON comment_versions(edited_at DESC);

-- ============================================================================
-- Table: comment_mentions
-- Description: Tracks @mentions in comments for notifications - Phase 4
-- ============================================================================

CREATE TABLE comment_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL,
    mentioned_user_id UUID NOT NULL,
    notified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_mention_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_mention_user FOREIGN KEY (mentioned_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT unique_comment_mention UNIQUE (comment_id, mentioned_user_id)
);

-- Indexes for comment_mentions table
CREATE INDEX idx_mentions_comment_id ON comment_mentions(comment_id);
CREATE INDEX idx_mentions_user_id ON comment_mentions(mentioned_user_id);
CREATE INDEX idx_mentions_notified ON comment_mentions(mentioned_user_id) WHERE notified = FALSE;

-- ============================================================================
-- Table: notifications
-- Description: User notifications for mentions, replies, reactions - Phase 4
-- ============================================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL,
    comment_id UUID NOT NULL,
    session_id UUID NOT NULL,
    from_user_id UUID NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_session FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT valid_notification_type CHECK (type IN ('mention', 'reply', 'reaction'))
);

-- Indexes for notifications table
CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_comment_id ON notifications(comment_id);
CREATE INDEX idx_notifications_session_id ON notifications(session_id);
CREATE INDEX idx_notifications_type ON notifications(type);

-- ============================================================================
-- Table: activity_log
-- Description: Comprehensive audit log for all collaboration activities
-- ============================================================================

CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id UUID,
    activity_type VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_activity_session FOREIGN KEY (session_id) REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for activity_log table
CREATE INDEX idx_activity_session_id ON activity_log(session_id);
CREATE INDEX idx_activity_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_type ON activity_log(activity_type);
CREATE INDEX idx_activity_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_activity_details ON activity_log USING GIN(details);

-- ============================================================================
-- Triggers for automatic timestamp updates
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for collaboration_sessions table
DROP TRIGGER IF EXISTS update_sessions_updated_at ON collaboration_sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON collaboration_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for comments table
DROP TRIGGER IF EXISTS update_comments_updated_at ON comments;
CREATE TRIGGER update_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Triggers for comment version history (Phase 4)
-- ============================================================================

-- Function to save comment version before edit
CREATE OR REPLACE FUNCTION save_comment_version()
RETURNS TRIGGER AS $$
DECLARE
    next_version INTEGER;
BEGIN
    -- Only create version if content changed and it's not a soft delete
    IF OLD.content <> NEW.content AND NEW.deleted_at IS NULL THEN
        -- Get next version number
        SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
        FROM comment_versions
        WHERE comment_id = OLD.id;
        
        -- Insert old version
        INSERT INTO comment_versions (comment_id, version, content, edited_by, edited_at)
        VALUES (OLD.id, next_version, OLD.content, NEW.author_id, NOW());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to save version before comment update
DROP TRIGGER IF EXISTS save_comment_version_trigger ON comments;
CREATE TRIGGER save_comment_version_trigger
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION save_comment_version();

-- ============================================================================
-- Triggers for mention notifications (Phase 4)
-- ============================================================================

-- Function to detect and create mention notifications
CREATE OR REPLACE FUNCTION process_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
    mentioned_username TEXT;
    mentioned_user_id UUID;
    author_username TEXT;
BEGIN
    -- Get author username
    SELECT username INTO author_username FROM users WHERE id = NEW.author_id;
    
    -- Extract @mentions from comment content using regex
    FOR mentioned_username IN
        SELECT DISTINCT regexp_matches[1]
        FROM regexp_matches(NEW.content, '@(\w+)', 'g') AS regexp_matches
    LOOP
        -- Find user ID for mentioned username
        SELECT id INTO mentioned_user_id
        FROM users
        WHERE username = mentioned_username
        AND id != NEW.author_id; -- Don't notify yourself
        
        IF mentioned_user_id IS NOT NULL THEN
            -- Insert mention record
            INSERT INTO comment_mentions (comment_id, mentioned_user_id)
            VALUES (NEW.id, mentioned_user_id)
            ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING;
            
            -- Create notification
            INSERT INTO notifications (
                user_id,
                type,
                comment_id,
                session_id,
                from_user_id,
                message
            )
            VALUES (
                mentioned_user_id,
                'mention',
                NEW.id,
                NEW.session_id,
                NEW.author_id,
                author_username || ' mentioned you in a comment'
            );
        END IF;
    END LOOP;
    
    -- If this is a reply (has parent_id), notify parent comment author
    IF NEW.parent_id IS NOT NULL THEN
        SELECT author_id INTO mentioned_user_id
        FROM comments
        WHERE id = NEW.parent_id
        AND author_id != NEW.author_id; -- Don't notify yourself
        
        IF mentioned_user_id IS NOT NULL THEN
            INSERT INTO notifications (
                user_id,
                type,
                comment_id,
                session_id,
                from_user_id,
                message
            )
            VALUES (
                mentioned_user_id,
                'reply',
                NEW.id,
                NEW.session_id,
                NEW.author_id,
                author_username || ' replied to your comment'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to process mentions after comment insert
DROP TRIGGER IF EXISTS process_mentions_trigger ON comments;
CREATE TRIGGER process_mentions_trigger
    AFTER INSERT ON comments
    FOR EACH ROW
    EXECUTE FUNCTION process_comment_mentions();

-- ============================================================================
-- Views for common queries
-- ============================================================================

-- View: active_sessions
-- Description: Shows currently active collaboration sessions with participant counts
CREATE OR REPLACE VIEW active_sessions AS
SELECT 
    cs.id,
    cs.session_id,
    cs.operation_id,
    cs.owner_id,
    u.username AS owner_username,
    cs.target,
    cs.objective,
    cs.start_time,
    cs.metadata,
    COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.left_at IS NULL) AS active_participants,
    COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL) AS comment_count
FROM collaboration_sessions cs
LEFT JOIN users u ON cs.owner_id = u.id
LEFT JOIN session_participants sp ON cs.id = sp.session_id
LEFT JOIN comments c ON cs.id = c.session_id
WHERE cs.status = 'active'
GROUP BY cs.id, cs.session_id, cs.operation_id, cs.owner_id, u.username, 
         cs.target, cs.objective, cs.start_time, cs.metadata;

-- View: session_summary
-- Description: Comprehensive summary of each session including all activity
CREATE OR REPLACE VIEW session_summary AS
SELECT 
    cs.id,
    cs.session_id,
    cs.operation_id,
    cs.status,
    cs.start_time,
    cs.end_time,
    EXTRACT(EPOCH FROM (COALESCE(cs.end_time, NOW()) - cs.start_time)) AS duration_seconds,
    u.username AS owner_username,
    COUNT(DISTINCT sp.user_id) AS total_participants,
    COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.left_at IS NULL) AS active_participants,
    COUNT(DISTINCT c.id) FILTER (WHERE c.deleted_at IS NULL) AS active_comments,
    COUNT(DISTINCT al.id) AS activity_count,
    MAX(al.created_at) AS last_activity
FROM collaboration_sessions cs
LEFT JOIN users u ON cs.owner_id = u.id
LEFT JOIN session_participants sp ON cs.id = sp.session_id
LEFT JOIN comments c ON cs.id = c.session_id
LEFT JOIN activity_log al ON cs.id = al.session_id
GROUP BY cs.id, cs.session_id, cs.operation_id, cs.status, 
         cs.start_time, cs.end_time, u.username;

-- ============================================================================
-- Functions for common operations
-- ============================================================================

-- Function: get_session_participants
-- Description: Retrieves all active participants in a session with their details
CREATE OR REPLACE FUNCTION get_session_participants(p_session_id UUID)
RETURNS TABLE (
    user_id UUID,
    username VARCHAR,
    full_name VARCHAR,
    role VARCHAR,
    joined_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.full_name,
        sp.role,
        sp.joined_at
    FROM session_participants sp
    JOIN users u ON sp.user_id = u.id
    WHERE sp.session_id = p_session_id
    AND sp.left_at IS NULL
    ORDER BY sp.joined_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: cleanup_old_sessions
-- Description: Archives or cleans up sessions older than specified days
CREATE OR REPLACE FUNCTION cleanup_old_sessions(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- This would typically move to an archive table rather than delete
    -- For now, we just mark them as completed if still active
    UPDATE collaboration_sessions
    SET status = 'completed',
        end_time = NOW(),
        updated_at = NOW()
    WHERE status = 'active'
    AND start_time < NOW() - INTERVAL '1 day' * days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Initial data / Seed data (optional)
-- ============================================================================

-- Create a default admin user (password should be changed immediately)
-- Password: 'changeme' (hashed with bcrypt)
INSERT INTO users (username, email, password_hash, full_name, role, status)
VALUES (
    'admin',
    'admin@boo.local',
    '$2b$10$rKvAJxZxGXPqNBWFQqvLFeVYCQhAjH4jqZKM5qQH5gGkXvBKRfZ2S',
    'System Administrator',
    'admin',
    'active'
)
ON CONFLICT (username) DO NOTHING;

-- ============================================================================
-- Grants and Permissions
-- ============================================================================

-- Grant necessary permissions to the application user
-- Note: Replace 'boo_app_user' with your actual application database user

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO boo_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO boo_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO boo_app_user;

-- ============================================================================
-- Comments on tables and columns
-- ============================================================================

COMMENT ON TABLE users IS 'Core user accounts with authentication and authorization';
COMMENT ON TABLE collaboration_sessions IS 'Collaboration sessions linked to security operations';
COMMENT ON TABLE session_participants IS 'Users participating in collaboration sessions';
COMMENT ON TABLE comments IS 'Comments on events, findings, and code lines';
COMMENT ON TABLE activity_log IS 'Comprehensive audit log for all collaboration activities';

COMMENT ON COLUMN collaboration_sessions.operation_id IS 'Links to the parent security operation';
COMMENT ON COLUMN collaboration_sessions.session_id IS 'Human-readable session identifier';
COMMENT ON COLUMN collaboration_sessions.metadata IS 'Flexible JSON storage for session-specific data';
COMMENT ON COLUMN comments.target_type IS 'Type of target: event, finding, or line';
COMMENT ON COLUMN comments.target_id IS 'Identifier of the target (event ID, line number, etc.)';
COMMENT ON COLUMN activity_log.details IS 'JSON details about the activity';

-- ============================================================================
-- Schema Version Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO schema_version (version, description)
VALUES (1, 'Initial schema for real-time collaboration system')
ON CONFLICT (version) DO NOTHING;

INSERT INTO schema_version (version, description)
VALUES (2, 'Phase 4: Enhanced commenting with reactions, versions, mentions, and notifications')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- End of schema
-- ============================================================================
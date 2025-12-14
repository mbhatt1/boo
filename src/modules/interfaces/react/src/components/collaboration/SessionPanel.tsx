/**
 * SessionPanel Component
 * 
 * Session management UI panel for collaboration.
 * Provides interface for creating sessions, viewing active sessions,
 * joining/leaving sessions, and viewing participants.
 * 
 * Features:
 * - Session creation form
 * - Active sessions list
 * - Join/leave session buttons
 * - Session participants list
 * - Session info display
 */

import React, { useState } from 'react';
import { SessionMetadata, PresenceUser } from '../../../../../collaboration/types/index.js';
import { PresenceList } from './PresenceIndicator.js';

export interface SessionPanelProps {
  /** Current session metadata */
  currentSession: SessionMetadata | null;
  
  /** List of participants in current session */
  participants: PresenceUser[];
  
  /** Whether user is in a session */
  isInSession: boolean;
  
  /** Whether user is connected */
  isConnected: boolean;
  
  /** Create a new session */
  onCreateSession: (operationId: string, metadata: SessionMetadata) => void;
  
  /** Join an existing session */
  onJoinSession: (sessionId: string, role?: string) => void;
  
  /** Leave current session */
  onLeaveSession: () => void;
  
  /** Custom class name */
  className?: string;
}

/**
 * SessionPanel Component
 */
export const SessionPanel: React.FC<SessionPanelProps> = ({
  currentSession,
  participants,
  isInSession,
  isConnected,
  onCreateSession,
  onJoinSession,
  onLeaveSession,
  className = '',
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [operationId, setOperationId] = useState('');
  const [target, setTarget] = useState('');
  const [objective, setObjective] = useState('');
  const [joinSessionId, setJoinSessionId] = useState('');
  const [joinRole, setJoinRole] = useState<string>('viewer');

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!operationId.trim()) {
      alert('Please enter an operation ID');
      return;
    }

    const metadata: SessionMetadata = {
      target: target.trim() || 'Unknown',
      objective: objective.trim() || 'Security Assessment',
    };

    onCreateSession(operationId, metadata);
    
    // Reset form
    setOperationId('');
    setTarget('');
    setObjective('');
    setShowCreateForm(false);
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!joinSessionId.trim()) {
      alert('Please enter a session ID');
      return;
    }

    onJoinSession(joinSessionId, joinRole);
    setJoinSessionId('');
  };

  return (
    <div className={`session-panel bg-white dark:bg-gray-800 rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Collaboration Session
        </h2>
        <div className="flex items-center gap-2 mt-1">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Current Session Info */}
        {isInSession && currentSession ? (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                Current Session
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-blue-700 dark:text-blue-300 font-medium">Target:</span>{' '}
                  <span className="text-blue-900 dark:text-blue-100">{currentSession.target}</span>
                </div>
                <div>
                  <span className="text-blue-700 dark:text-blue-300 font-medium">Objective:</span>{' '}
                  <span className="text-blue-900 dark:text-blue-100">{currentSession.objective}</span>
                </div>
                {currentSession.currentStep !== undefined && currentSession.totalSteps && (
                  <div>
                    <span className="text-blue-700 dark:text-blue-300 font-medium">Progress:</span>{' '}
                    <span className="text-blue-900 dark:text-blue-100">
                      Step {currentSession.currentStep} of {currentSession.totalSteps}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Leave button */}
              <button
                onClick={onLeaveSession}
                className="mt-3 w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Leave Session
              </button>
            </div>

            {/* Participants */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Participants ({participants.length})
              </h3>
              <PresenceList users={participants} />
            </div>
          </div>
        ) : (
          /* Not in session - show join/create options */
          <div className="space-y-4">
            {/* Create Session */}
            <div>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                disabled={!isConnected}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
              >
                {showCreateForm ? 'Cancel' : 'Create New Session'}
              </button>

              {showCreateForm && (
                <form onSubmit={handleCreateSession} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Operation ID *
                    </label>
                    <input
                      type="text"
                      value={operationId}
                      onChange={(e) => setOperationId(e.target.value)}
                      placeholder="OP-2024-001"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Target
                    </label>
                    <input
                      type="text"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Objective
                    </label>
                    <input
                      type="text"
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Network penetration test"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Create Session
                  </button>
                </form>
              )}
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  OR
                </span>
              </div>
            </div>

            {/* Join Session */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                Join Existing Session
              </h3>
              <form onSubmit={handleJoinSession} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Session ID
                  </label>
                  <input
                    type="text"
                    value={joinSessionId}
                    onChange={(e) => setJoinSessionId(e.target.value)}
                    placeholder="SESSION-20240101-ABCD"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Role
                  </label>
                  <select
                    value={joinRole}
                    onChange={(e) => setJoinRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="commenter">Commenter</option>
                    <option value="operator">Operator</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!isConnected}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Join Session
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Compact session status badge
 */
export const SessionStatusBadge: React.FC<{
  isInSession: boolean;
  participantCount?: number;
  className?: string;
}> = ({ isInSession, participantCount = 0, className = '' }) => {
  if (!isInSession) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm ${className}`}>
        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
        <span className="text-gray-600 dark:text-gray-400">No Session</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/20 rounded-full text-sm ${className}`}>
      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      <span className="text-green-700 dark:text-green-300">
        In Session
      </span>
      {participantCount > 0 && (
        <span className="text-green-600 dark:text-green-400 font-medium">
          ({participantCount})
        </span>
      )}
    </div>
  );
};

export default SessionPanel;
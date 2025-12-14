"use strict";
/**
 * Real-Time Collaboration System - Type Definitions
 *
 * This module defines all TypeScript types and interfaces used throughout
 * the collaboration system, including WebSocket messages, database entities,
 * and service interfaces.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollaborationError = exports.CollaborationErrorCode = void 0;
// ============================================================================
// Error Types
// ============================================================================
/**
 * Collaboration system error codes
 */
var CollaborationErrorCode;
(function (CollaborationErrorCode) {
    CollaborationErrorCode[CollaborationErrorCode["AUTHENTICATION_FAILED"] = 1001] = "AUTHENTICATION_FAILED";
    CollaborationErrorCode[CollaborationErrorCode["INVALID_TOKEN"] = 1002] = "INVALID_TOKEN";
    CollaborationErrorCode[CollaborationErrorCode["SESSION_NOT_FOUND"] = 1003] = "SESSION_NOT_FOUND";
    CollaborationErrorCode[CollaborationErrorCode["PERMISSION_DENIED"] = 1004] = "PERMISSION_DENIED";
    CollaborationErrorCode[CollaborationErrorCode["INVALID_MESSAGE"] = 1005] = "INVALID_MESSAGE";
    CollaborationErrorCode[CollaborationErrorCode["RATE_LIMIT_EXCEEDED"] = 1006] = "RATE_LIMIT_EXCEEDED";
    CollaborationErrorCode[CollaborationErrorCode["SESSION_FULL"] = 1007] = "SESSION_FULL";
    CollaborationErrorCode[CollaborationErrorCode["DATABASE_ERROR"] = 2001] = "DATABASE_ERROR";
    CollaborationErrorCode[CollaborationErrorCode["REDIS_ERROR"] = 2002] = "REDIS_ERROR";
    CollaborationErrorCode[CollaborationErrorCode["INTERNAL_ERROR"] = 5000] = "INTERNAL_ERROR";
})(CollaborationErrorCode || (exports.CollaborationErrorCode = CollaborationErrorCode = {}));
/**
 * Collaboration error class
 */
class CollaborationError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'CollaborationError';
    }
}
exports.CollaborationError = CollaborationError;

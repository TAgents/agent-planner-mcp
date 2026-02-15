/**
 * Session Manager for MCP HTTP Server
 *
 * Manages client sessions for the Streamable HTTP transport.
 * Each session tracks:
 * - Unique session ID (Mcp-Session-Id header)
 * - Initialization state
 * - Client capabilities
 * - Creation and last activity timestamps
 */

const { randomUUID } = require('crypto');

class SessionManager {
  constructor(options = {}) {
    // In-memory session storage
    this.sessions = new Map();

    // Configuration
    this.sessionTimeout = options.sessionTimeout || 30 * 60 * 1000; // 30 minutes default
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes default

    // Start periodic cleanup
    this.startCleanup();

    console.error('SessionManager initialized');
  }

  /**
   * Create a new session
   * @returns {string} Session ID
   */
  createSession() {
    const sessionId = randomUUID();

    const session = {
      id: sessionId,
      initialized: false,
      clientCapabilities: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    this.sessions.set(sessionId, session);

    console.error(`Session created: ${sessionId}`);
    return sessionId;
  }

  /**
   * Get a session by ID
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object or null if not found
   */
  getSession(sessionId) {
    if (!sessionId) {
      return null;
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Update last activity
    session.lastActivityAt = Date.now();

    return session;
  }

  /**
   * Mark a session as initialized
   * @param {string} sessionId - Session ID
   * @param {Object} clientCapabilities - Client capabilities from initialize request
   */
  initializeSession(sessionId, clientCapabilities) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.initialized = true;
    session.clientCapabilities = clientCapabilities;
    session.lastActivityAt = Date.now();

    console.error(`Session initialized: ${sessionId}`);
  }

  /**
   * Check if a session is initialized
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if initialized
   */
  isInitialized(sessionId) {
    const session = this.sessions.get(sessionId);
    return session && session.initialized;
  }

  /**
   * Delete a session
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if session was deleted
   */
  deleteSession(sessionId) {
    const deleted = this.sessions.delete(sessionId);

    if (deleted) {
      console.error(`Session deleted: ${sessionId}`);
    }

    return deleted;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.lastActivityAt;

      if (age > this.sessionTimeout) {
        this.sessions.delete(sessionId);
        cleanedCount++;
        console.error(`Session expired: ${sessionId} (inactive for ${Math.round(age / 1000)}s)`);
      }
    }

    if (cleanedCount > 0) {
      console.error(`Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  startCleanup() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);

    // Prevent the timer from keeping the process alive
    this.cleanupTimer.unref();
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get session statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const now = Date.now();
    const stats = {
      total: this.sessions.size,
      initialized: 0,
      uninitialized: 0,
      sessions: []
    };

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.initialized) {
        stats.initialized++;
      } else {
        stats.uninitialized++;
      }

      stats.sessions.push({
        id: sessionId,
        initialized: session.initialized,
        age: Math.round((now - session.createdAt) / 1000),
        idleTime: Math.round((now - session.lastActivityAt) / 1000)
      });
    }

    return stats;
  }

  /**
   * Destroy the session manager
   */
  destroy() {
    this.stopCleanup();
    this.sessions.clear();
    console.error('SessionManager destroyed');
  }
}

module.exports = { SessionManager };

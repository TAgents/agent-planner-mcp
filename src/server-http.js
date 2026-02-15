/**
 * MCP HTTP/SSE Server
 *
 * Implements the MCP Streamable HTTP transport specification (2025-06-18)
 * https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
 *
 * Features:
 * - Single endpoint supporting POST and GET methods
 * - Session management via Mcp-Session-Id header
 * - Server-Sent Events (SSE) for streaming responses
 * - JSON-RPC 2.0 protocol
 * - Origin validation for security
 */

const express = require('express');
const { SessionManager } = require('./session-manager');
const { setupTools } = require('./tools');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
require('dotenv').config();

// MCP Protocol Version
const MCP_PROTOCOL_VERSION = '2025-03-26';

class MCPHTTPServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3100;
    this.host = options.host || process.env.HOST || '127.0.0.1';

    // Session manager
    this.sessionManager = new SessionManager({
      sessionTimeout: options.sessionTimeout || 30 * 60 * 1000,
      cleanupInterval: options.cleanupInterval || 5 * 60 * 1000
    });

    // Store for pending SSE streams per session
    this.sseStreams = new Map(); // sessionId -> { res, req }

    // Create Express app
    this.app = express();

    // Setup middleware and routes
    this.setupMiddleware();
    this.setupRoutes();

    console.error('MCPHTTPServer initialized');
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json());

    // Logging middleware
    this.app.use((req, res, next) => {
      console.error(`${req.method} ${req.path} - ${req.get('MCP-Protocol-Version') || 'no version'}`);
      next();
    });

    // Protocol version validation
    this.app.use((req, res, next) => {
      // Skip version check for health endpoint
      if (req.path === '/health') {
        return next();
      }

      const version = req.get('MCP-Protocol-Version');

      // Backwards compatibility: assume 2025-03-26 if not provided
      if (!version) {
        req.mcpVersion = '2025-03-26';
        return next();
      }

      req.mcpVersion = version;
      next();
    });

    // Origin validation for security (DNS rebinding protection)
    this.app.use((req, res, next) => {
      // Skip origin check for health endpoint
      if (req.path === '/health') {
        return next();
      }

      const origin = req.get('Origin');

      // If Origin header is present, validate it
      if (origin) {
        // For localhost binding, accept localhost origins
        const allowedOrigins = [
          'http://localhost',
          'http://127.0.0.1',
          `http://localhost:${this.port}`,
          `http://127.0.0.1:${this.port}`
        ];

        const originUrl = new URL(origin);
        const isAllowed = allowedOrigins.some(allowed => origin.startsWith(allowed));

        if (!isAllowed) {
          console.error(`Rejected request from origin: ${origin}`);
          return res.status(403).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Forbidden origin'
            }
          });
        }
      }

      next();
    });
  }

  /**
   * Setup Express routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const stats = this.sessionManager.getStats();
      res.json({
        status: 'ok',
        version: MCP_PROTOCOL_VERSION,
        server: {
          name: process.env.MCP_SERVER_NAME || 'planning-tools',
          version: process.env.MCP_SERVER_VERSION || '0.3.1'
        },
        sessions: {
          total: stats.total,
          initialized: stats.initialized
        }
      });
    });

    // Main MCP endpoint - handles both POST and GET
    this.app.post('/mcp', this.handleMCPPost.bind(this));
    this.app.get('/mcp', this.handleMCPGet.bind(this));

    // Session termination endpoint
    this.app.delete('/mcp', this.handleMCPDelete.bind(this));

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Not found'
        }
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Express error:', err);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: err.message
        }
      });
    });
  }

  /**
   * Handle POST requests (client-to-server messages)
   */
  async handleMCPPost(req, res) {
    try {
      // Get or create session
      let sessionId = req.get('Mcp-Session-Id');
      let session = sessionId ? this.sessionManager.getSession(sessionId) : null;

      // Validate session exists if session ID provided
      if (sessionId && !session) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not found'
          }
        });
      }

      // Parse JSON-RPC message
      const message = req.body;

      if (!message || !message.jsonrpc || message.jsonrpc !== '2.0') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC request'
          }
        });
      }

      // Handle different message types
      const isRequest = message.method && message.id !== undefined;
      const isNotification = message.method && message.id === undefined;
      const isResponse = message.result !== undefined || message.error !== undefined;

      if (isNotification || isResponse) {
        // For notifications and responses, return 202 Accepted
        return res.status(202).send();
      }

      if (isRequest) {
        // Handle JSON-RPC request
        const response = await this.handleRequest(message, session, sessionId);

        // If this is an initialize request, create session and include session ID
        if (message.method === 'initialize' && response.result) {
          sessionId = this.sessionManager.createSession();
          this.sessionManager.initializeSession(sessionId, message.params?.capabilities);

          // Set session ID header in response
          res.setHeader('Mcp-Session-Id', sessionId);

          console.error(`Session initialized: ${sessionId}`);
        }

        // Check if we should stream the response via SSE
        const acceptHeader = req.get('Accept') || '';
        const supportsSSE = acceptHeader.includes('text/event-stream');

        // For now, we'll send simple JSON responses
        // SSE streaming can be added later for long-running operations
        if (supportsSSE && this.shouldStreamResponse(message)) {
          // Send SSE stream
          return this.streamResponse(req, res, response, sessionId);
        } else {
          // Send simple JSON response
          res.setHeader('Content-Type', 'application/json');
          return res.json(response);
        }
      }

      // Unknown message type
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid request'
        }
      });
    } catch (error) {
      console.error('Error handling POST request:', error);
      return res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      });
    }
  }

  /**
   * Handle GET requests (SSE streams for server-to-client messages)
   */
  handleMCPGet(req, res) {
    try {
      // Validate Accept header
      const acceptHeader = req.get('Accept') || '';
      if (!acceptHeader.includes('text/event-stream')) {
        return res.status(405).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Method not allowed. GET requires Accept: text/event-stream'
          }
        });
      }

      // Get session
      const sessionId = req.get('Mcp-Session-Id');
      if (!sessionId) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Mcp-Session-Id header required'
          }
        });
      }

      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not found'
          }
        });
      }

      // Setup SSE stream
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

      // Store SSE stream for this session
      this.sseStreams.set(sessionId, { res, req });

      console.error(`SSE stream opened for session: ${sessionId}`);

      // Send initial comment to establish connection
      res.write(': connected\n\n');

      // Handle client disconnect
      req.on('close', () => {
        console.error(`SSE stream closed for session: ${sessionId}`);
        this.sseStreams.delete(sessionId);
      });
    } catch (error) {
      console.error('Error handling GET request:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      });
    }
  }

  /**
   * Handle DELETE requests (session termination)
   */
  handleMCPDelete(req, res) {
    const sessionId = req.get('Mcp-Session-Id');

    if (!sessionId) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Mcp-Session-Id header required'
        }
      });
    }

    // Close any SSE streams for this session
    const stream = this.sseStreams.get(sessionId);
    if (stream) {
      stream.res.end();
      this.sseStreams.delete(sessionId);
    }

    // Delete session
    const deleted = this.sessionManager.deleteSession(sessionId);

    if (deleted) {
      return res.status(204).send();
    } else {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found'
        }
      });
    }
  }

  /**
   * Handle JSON-RPC request
   */
  async handleRequest(message, session, sessionId) {
    // Create MCP server instance for this request
    const mcpServer = new Server({
      name: process.env.MCP_SERVER_NAME || 'planning-tools',
      version: process.env.MCP_SERVER_VERSION || '0.3.1'
    }, {
      capabilities: {
        tools: {}
      }
    });

    // Setup tools on the server
    setupTools(mcpServer);

    // Process the request through MCP server
    try {
      // Get the appropriate request handler
      const handlers = mcpServer._requestHandlers;
      const handler = handlers.get(message.method);

      if (!handler) {
        return {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32601,
            message: `Method not found: ${message.method}`
          }
        };
      }

      // Call the handler with the full request format expected by SDK
      const result = await handler(message);

      return {
        jsonrpc: '2.0',
        id: message.id,
        result
      };
    } catch (error) {
      console.error(`Error handling method ${message.method}:`, error);

      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      };
    }
  }

  /**
   * Determine if response should be streamed via SSE
   */
  shouldStreamResponse(message) {
    // For now, we don't need streaming for planning tools
    // All operations are relatively quick
    // This can be enabled later for long-running operations
    return false;
  }

  /**
   * Stream response via SSE
   */
  streamResponse(req, res, response, sessionId) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send the response as an SSE event
    res.write(`data: ${JSON.stringify(response)}\n\n`);

    // Close the stream
    res.end();
  }

  /**
   * Start the HTTP server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          console.error(`MCP HTTP Server listening on ${this.host}:${this.port}`);
          console.error(`MCP endpoint: http://${this.host}:${this.port}/mcp`);
          console.error(`Health check: http://${this.host}:${this.port}/health`);
          console.error(`Protocol version: ${MCP_PROTOCOL_VERSION}`);
          resolve();
        });

        this.server.on('error', (error) => {
          console.error('Server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop() {
    return new Promise((resolve) => {
      // Close all SSE streams
      for (const [sessionId, stream] of this.sseStreams.entries()) {
        stream.res.end();
      }
      this.sseStreams.clear();

      // Destroy session manager
      this.sessionManager.destroy();

      // Close HTTP server
      if (this.server) {
        this.server.close(() => {
          console.error('MCP HTTP Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = { MCPHTTPServer };

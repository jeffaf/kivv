import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env, User } from '../../shared/types';
import { createAuthMiddleware } from './auth';
import { HTTP_OK, HTTP_INTERNAL_ERROR } from '../../shared/constants';
import { listLibrary } from './tools/list-library';
import { searchPapers } from './tools/search-papers';
import { markExplored } from './tools/mark-explored';
import { getUserRSSFeed, getUserAtomFeed } from './feeds/user-feed';
import { handleJsonRpc } from './jsonrpc';

// Define Hono app context with bindings and variables
type HonoEnv = {
  Bindings: Env;
  Variables: {
    user: User;
  };
};

// Initialize Hono app with full context type
const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', logger()); // Request logging
app.use('*', cors({
  origin: '*', // Allow all origins for MCP (Claude Desktop needs access)
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-api-key'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
}));

// Error handling middleware
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: err.message
    },
    HTTP_INTERNAL_ERROR
  );
});

// Health check endpoint (no auth required)
app.get('/health', async (c) => {
  const env = c.env;

  try {
    // Test database connection
    const dbTest = await env.DB
      .prepare('SELECT 1 as test')
      .first();

    // Test KV connection
    const kvTest = await env.CACHE.get('health-check-test');

    // All checks passed
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbTest ? 'connected' : 'error',
        cache: 'connected', // KV get doesn't throw on missing key
        storage: 'connected', // R2 doesn't need health check
      },
      version: '1.0.0',
    }, HTTP_OK);
  } catch (error) {
    console.error('Health check failed:', error);
    return c.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 503); // Service Unavailable
  }
});

// =============================================================================
// Public Feed Routes (No Authentication Required)
// =============================================================================

/**
 * RSS 2.0 Feed - Public access to user's paper library
 * GET /feeds/:username/rss.xml
 */
app.get('/feeds/:username/rss.xml', getUserRSSFeed);

/**
 * Atom 1.0 Feed - Public access to user's paper library
 * GET /feeds/:username/atom.xml
 */
app.get('/feeds/:username/atom.xml', getUserAtomFeed);

// Apply authentication to all /mcp routes (exact and nested paths)
app.use('/mcp', createAuthMiddleware());
app.use('/mcp/*', createAuthMiddleware());

// =============================================================================
// MCP JSON-RPC Protocol Endpoint
// =============================================================================
// This endpoint implements the MCP JSON-RPC protocol for standard MCP clients
// like npx mcp-remote. Supports: initialize, tools/list, tools/call methods
// =============================================================================

/**
 * MCP JSON-RPC endpoint - Standard MCP protocol handler
 *
 * Supports JSON-RPC 2.0 with MCP methods:
 * - initialize: Returns server capabilities and protocol version
 * - tools/list: Returns available tool definitions with JSON Schema
 * - tools/call: Executes a tool with given arguments
 *
 * Request format:
 * {
 *   "jsonrpc": "2.0",
 *   "method": "tools/call",
 *   "params": { "name": "list_library", "arguments": { "limit": 20 } },
 *   "id": 1
 * }
 *
 * Response format:
 * {
 *   "jsonrpc": "2.0",
 *   "result": { "content": [{ "type": "text", "text": "..." }] },
 *   "id": 1
 * }
 */
app.post('/mcp', handleJsonRpc);

// =============================================================================
// MCP Tool Routes (REST-style for Claude Desktop direct config)
// =============================================================================

/**
 * list_library - Query user's paper library with filters and pagination
 *
 * Request body (all optional):
 * {
 *   "limit": 20,        // Default: 50, Max: 100
 *   "offset": 0,        // Default: 0
 *   "explored": true,   // null = all, true = only explored, false = only unexplored
 *   "bookmarked": true  // null = all, true = only bookmarked, false = only unbookmarked
 * }
 *
 * Response:
 * {
 *   "papers": PaperWithStatus[],
 *   "total": number,
 *   "limit": number,
 *   "offset": number
 * }
 */
app.post('/mcp/tools/list_library', listLibrary);

/**
 * search_papers - Search user's paper library by keywords
 *
 * Request body:
 * {
 *   "query": "neural networks",  // REQUIRED - search keywords
 *   "limit": 20,                 // Optional: Default 50, Max 100
 *   "offset": 0,                 // Optional: Default 0
 *   "explored": true,            // Optional: Filter by exploration status
 *   "bookmarked": true           // Optional: Filter by bookmark status
 * }
 *
 * Response:
 * {
 *   "papers": PaperWithStatus[],
 *   "total": number,
 *   "limit": number,
 *   "offset": number,
 *   "query": string
 * }
 */
app.post('/mcp/tools/search_papers', searchPapers);

/**
 * mark_explored - Update paper exploration status
 *
 * Request body:
 * {
 *   "paper_id": 42,              // REQUIRED - which paper to update
 *   "explored": true,            // Optional: Mark as explored/unexplored
 *   "bookmarked": false,         // Optional: Mark as bookmarked/unbookmarked
 *   "notes": "Great paper!"      // Optional: Add/update/clear notes (null to clear)
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "paper_id": 42,
 *   "status": {
 *     "explored": true,
 *     "bookmarked": false,
 *     "notes": "Great paper!",
 *     "read_at": "2025-11-30T12:34:56.789Z"
 *   }
 * }
 */
app.post('/mcp/tools/mark_explored', markExplored);

// MCP status endpoint (for testing auth)
app.get('/mcp/status', async (c) => {
  const user = c.get('user'); // From auth middleware
  return c.json({
    message: 'MCP server is running',
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not found',
      code: 'NOT_FOUND',
      path: c.req.path
    },
    404
  );
});

export default app;

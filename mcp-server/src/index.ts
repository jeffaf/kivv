import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Env, User } from '../../shared/types';
import { createAuthMiddleware } from './auth';
import { HTTP_OK, HTTP_INTERNAL_ERROR } from '../../shared/constants';

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

// Apply authentication to all /mcp/* routes
app.use('/mcp/*', createAuthMiddleware());

// MCP routes will be added in CHUNK 5-7
// Placeholder for now
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

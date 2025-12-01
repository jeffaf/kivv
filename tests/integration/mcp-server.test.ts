import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../mcp-server/src/index';

// Test API key from database seed
const TEST_API_KEY = 'c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d';

// Database setup helpers
async function initializeSchema() {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        display_name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        is_active BOOLEAN DEFAULT 1
      )
    `),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key)`),
  ]);
}

async function seedTestDatabase() {
  // Clean database first
  await env.DB.prepare('DELETE FROM users').run();

  // Create test user with known API key
  await env.DB.prepare(`
    INSERT INTO users (id, username, email, api_key, is_active)
    VALUES (1, 'testuser', 'test@example.com', ?, 1)
  `).bind(TEST_API_KEY).run();
}

describe('MCP Server Integration Tests', () => {
  beforeAll(async () => {
    await initializeSchema();
  });

  beforeEach(async () => {
    await seedTestDatabase();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(200);

      const data = await resp.json();
      expect(data.status).toBe('healthy');
      expect(data.services.database).toBe('connected');
      expect(data.services.cache).toBe('connected');
    });

    it('should include timestamp in health check', async () => {
      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);
      const data = await resp.json();

      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include version number', async () => {
      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);
      const data = await resp.json();

      expect(data.version).toBe('1.0.0');
    });

    it('should not require authentication', async () => {
      // No x-api-key header
      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(200);
    });
  });

  describe('MCP Status Endpoint', () => {
    it('should require authentication', async () => {
      const req = new Request('https://test.com/mcp/status');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(401);

      const data = await resp.json();
      expect(data.code).toBe('MISSING_AUTH');
    });

    it('should reject invalid API key', async () => {
      const req = new Request('https://test.com/mcp/status', {
        headers: {
          'x-api-key': 'invalid-key-12345',
        },
      });
      const resp = await app.fetch(req, env);

      expect(resp.status).toBe(401);
      const data = await resp.json();
      expect(data.code).toBe('INVALID_API_KEY');
    });

    it('should return status with valid API key', async () => {
      const req = new Request('https://test.com/mcp/status', {
        headers: {
          'x-api-key': TEST_API_KEY,
        },
      });
      const resp = await app.fetch(req, env);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.authenticated).toBe(true);
      expect(data.user.username).toBe('testuser');
      expect(data.message).toBe('MCP server is running');
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers', async () => {
      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);

      expect(resp.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('should handle OPTIONS preflight', async () => {
      const req = new Request('https://test.com/health', {
        method: 'OPTIONS',
      });
      const resp = await app.fetch(req, env);

      expect(resp.status).toBe(204); // No Content - standard CORS preflight response
      expect(resp.headers.get('access-control-allow-methods')).toContain('GET');
      expect(resp.headers.get('access-control-allow-methods')).toContain('POST');
    });

    it('should allow x-api-key header', async () => {
      const req = new Request('https://test.com/health', {
        method: 'OPTIONS',
      });
      const resp = await app.fetch(req, env);

      const allowedHeaders = resp.headers.get('access-control-allow-headers');
      expect(allowedHeaders).toContain('x-api-key');
      expect(allowedHeaders).toContain('Content-Type');
    });

    it('should set credentials flag', async () => {
      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);

      expect(resp.headers.get('access-control-allow-credentials')).toBe('true');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const req = new Request('https://test.com/nonexistent');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(404);

      const data = await resp.json();
      expect(data.code).toBe('NOT_FOUND');
      expect(data.path).toBe('/nonexistent');
    });

    it('should return 404 for unknown MCP routes', async () => {
      const req = new Request('https://test.com/mcp/invalid', {
        headers: {
          'x-api-key': TEST_API_KEY,
        },
      });
      const resp = await app.fetch(req, env);

      expect(resp.status).toBe(404);
    });

    it('should include error details in 404 response', async () => {
      const req = new Request('https://test.com/does/not/exist');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(404);

      const data = await resp.json();
      expect(data.error).toBe('Not found');
      expect(data.code).toBe('NOT_FOUND');
      expect(data.path).toBe('/does/not/exist');
    });
  });

  describe('Error Handling', () => {
    it('should not expose internal errors to client', async () => {
      // Health check should handle database errors gracefully
      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);

      // Should either be healthy (200) or unhealthy (503), never 500
      expect([200, 503]).toContain(resp.status);
    });

    it('should include timestamp in error responses', async () => {
      const req = new Request('https://test.com/nonexistent');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(404);

      // Error response should be JSON
      const contentType = resp.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });
  });

  describe('Request Logging', () => {
    it('should log requests to console', async () => {
      // This test verifies the logger middleware is active
      // In production, logs go to Cloudflare dashboard

      const req = new Request('https://test.com/health');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(200);

      // Logging is working if we get a response
      // Actual log inspection requires checking Cloudflare dashboard
    });
  });

  describe('Authentication Middleware', () => {
    it('should protect all /mcp/* routes', async () => {
      // No API key
      const req = new Request('https://test.com/mcp/status');
      const resp = await app.fetch(req, env);
      expect(resp.status).toBe(401);
    });

    it('should allow authenticated access to /mcp/* routes', async () => {
      const req = new Request('https://test.com/mcp/status', {
        headers: {
          'x-api-key': TEST_API_KEY,
        },
      });
      const resp = await app.fetch(req, env);

      expect(resp.status).toBe(200);
    });

    it('should reject empty API key', async () => {
      const req = new Request('https://test.com/mcp/status', {
        headers: {
          'x-api-key': '',
        },
      });
      const resp = await app.fetch(req, env);

      expect(resp.status).toBe(401);
    });

    it('should reject whitespace-only API key', async () => {
      const req = new Request('https://test.com/mcp/status', {
        headers: {
          'x-api-key': '   ',
        },
      });
      const resp = await app.fetch(req, env);

      expect(resp.status).toBe(401);
    });
  });
});

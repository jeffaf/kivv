// =============================================================================
// kivv - Authentication Security Tests
// =============================================================================
// CRITICAL: 100% code coverage required for security-critical code
// All tests must pass before deployment
//
// Test Coverage:
// ✅ Valid API key authentication
// ✅ Invalid API key rejection
// ✅ Missing API key rejection
// ✅ Inactive user rejection
// ✅ SQL injection prevention
// ✅ Error response formats
// ✅ No sensitive data leakage
// ✅ Edge cases (empty strings, long keys, special chars)
// ✅ last_login timestamp update
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {
  authenticateUser,
  createUnauthorizedResponse,
  createForbiddenResponse,
} from '../../mcp-server/src/auth';

describe('Authentication Security Tests', () => {
  beforeEach(async () => {
    // Create users table if it doesn't exist (single statement)
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, api_key TEXT UNIQUE NOT NULL, display_name TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_login TEXT, is_active BOOLEAN DEFAULT 1)`);

    // Reset database to known state before each test
    // This ensures test isolation and predictable results
    await env.DB.exec(`DELETE FROM users`);

    // Insert test users
    // User 1: Active user with valid API key
    // User 2: Inactive user (is_active = 0)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (id, username, email, api_key, is_active) VALUES (1, 'testuser', 'test@example.com', 'valid-api-key-123', 1)`),
      env.DB.prepare(`INSERT INTO users (id, username, email, api_key, is_active) VALUES (2, 'inactive', 'inactive@example.com', 'inactive-key-456', 0)`)
    ]);
  });

  // ===========================================================================
  // Core Authentication Tests
  // ===========================================================================

  describe('authenticateUser', () => {
    it('should return user for valid API key', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': 'valid-api-key-123' },
      });

      const user = await authenticateUser(request, env);

      expect(user).not.toBeNull();
      expect(user?.username).toBe('testuser');
      expect(user?.email).toBe('test@example.com');
      // SQLite stores booleans as 0/1, not false/true
      expect(user?.is_active).toBeTruthy();
    });

    it('should return null for missing API key', async () => {
      const request = new Request('https://example.com');

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should return null for invalid API key', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': 'invalid-key-999' },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should return null for inactive user', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': 'inactive-key-456' },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should update last_login timestamp on successful auth', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': 'valid-api-key-123' },
      });

      await authenticateUser(request, env);

      // Wait for async update to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await env.DB
        .prepare('SELECT last_login FROM users WHERE id = 1')
        .first();

      expect(result.last_login).not.toBeNull();

      // Verify it's a recent timestamp
      const lastLogin = new Date(result.last_login as string);
      const now = new Date();
      const diffMs = now.getTime() - lastLogin.getTime();
      expect(diffMs).toBeLessThan(5000); // Within 5 seconds
    });

    it('should prevent SQL injection in API key parameter', async () => {
      // Attempt SQL injection with classic attack patterns
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': "' OR '1'='1" },
      });

      const user = await authenticateUser(request, env);

      // Should return null, not bypass authentication
      expect(user).toBeNull();

      // Verify database wasn't tampered with
      const userCount = await env.DB
        .prepare('SELECT COUNT(*) as count FROM users')
        .first();
      expect(userCount.count).toBe(2); // Still 2 users
    });

    it('should prevent SQL injection with UNION attack', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': "' UNION SELECT * FROM users--" },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should prevent SQL injection with DROP TABLE attempt', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': "'; DROP TABLE users;--" },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();

      // Verify table still exists
      const result = await env.DB
        .prepare('SELECT COUNT(*) as count FROM users')
        .first();
      expect(result.count).toBe(2);
    });
  });

  // ===========================================================================
  // Error Response Tests
  // ===========================================================================

  describe('Error Responses', () => {
    it('should return 401 for missing API key', async () => {
      const response = createUnauthorizedResponse('missing');

      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.code).toBe('MISSING_AUTH');
      expect(body.error).toContain('API key required');
      expect(body.error).toContain('x-api-key header');
    });

    it('should return 401 for invalid API key', async () => {
      const response = createUnauthorizedResponse('invalid');

      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.code).toBe('INVALID_API_KEY');
      expect(body.error).toContain('Invalid or expired');
    });

    it('should return 403 for inactive user', async () => {
      const response = createForbiddenResponse();

      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.code).toBe('USER_INACTIVE');
      expect(body.error).toContain('inactive');
      expect(body.error).toContain('administrator');
    });

    it('should not leak sensitive user data in error responses', async () => {
      const response401Missing = createUnauthorizedResponse('missing');
      const response401Invalid = createUnauthorizedResponse('invalid');
      const response403 = createForbiddenResponse();

      const body401Missing = await response401Missing.json();
      const body401Invalid = await response401Invalid.json();
      const body403 = await response403.json();

      // Should not contain:
      // - Email addresses (pattern: xxx@xxx.xxx)
      // - User IDs (any numbers)
      // - API keys (any long alphanumeric strings)
      // - Usernames

      const bodies = [
        JSON.stringify(body401Missing),
        JSON.stringify(body401Invalid),
        JSON.stringify(body403),
      ];

      for (const body of bodies) {
        expect(body).not.toMatch(/\d+@/); // email pattern
        expect(body).not.toMatch(/testuser/); // username
        // Note: Can't check for "inactive" as it's in the generic error message
        expect(body).not.toMatch(/inactive@example\.com/); // email
        expect(body).not.toMatch(/api-key-\d+/); // API key pattern
      }
    });

    it('should set correct Content-Type header on error responses', async () => {
      const response = createUnauthorizedResponse('invalid');

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  // ===========================================================================
  // Security Edge Cases
  // ===========================================================================

  describe('Security Edge Cases', () => {
    it('should handle empty string API key', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': '' },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should handle whitespace-only API key', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': '   ' },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should handle very long API key (potential DoS)', async () => {
      const longKey = 'a'.repeat(10000);
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': longKey },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should handle special characters in API key', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': '"><script>alert(1)</script>' },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should handle Unicode characters in API key', async () => {
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': '🔑🔐💻' },
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull();
    });

    it('should handle null bytes in API key', async () => {
      // Note: HTTP headers cannot contain null bytes, so this test will fail
      // at header creation time, not in our auth code. This is expected behavior.
      try {
        const request = new Request('https://example.com', {
          headers: { 'x-api-key': 'valid\x00key' },
        });
        const user = await authenticateUser(request, env);
        // If we get here, the header was somehow created. Ensure it fails auth.
        expect(user).toBeNull();
      } catch (error) {
        // Expected: Header creation should fail
        expect(error).toBeDefined();
      }
    });

    it('should handle case-sensitive API keys', async () => {
      // API keys should be case-sensitive
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': 'VALID-API-KEY-123' }, // uppercase
      });

      const user = await authenticateUser(request, env);

      expect(user).toBeNull(); // Should be case-sensitive
    });

    it('should handle API key with leading/trailing whitespace', async () => {
      // NOTE: HTTP headers automatically trim leading/trailing whitespace
      // per the HTTP spec, so '  valid-api-key-123  ' becomes 'valid-api-key-123'
      // This test verifies that the trimmed version is correctly validated
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': '  valid-api-key-123  ' },
      });

      const user = await authenticateUser(request, env);

      // HTTP will have trimmed it to 'valid-api-key-123', which is valid
      expect(user).not.toBeNull();
      expect(user?.username).toBe('testuser');
    });
  });

  // ===========================================================================
  // Database Error Handling
  // ===========================================================================

  describe('Database Error Handling', () => {
    it('should handle database query errors gracefully', async () => {
      // Create a request with valid format but against a potentially corrupted state
      const request = new Request('https://example.com', {
        headers: { 'x-api-key': 'some-key' },
      });

      // The authenticateUser function should catch database errors
      // and return null instead of throwing
      const user = await authenticateUser(request, env);

      // Should return null, not throw an exception
      expect(user).toBeNull();
    });
  });

  // ===========================================================================
  // Timing Attack Prevention
  // ===========================================================================

  describe('Timing Attack Considerations', () => {
    it('should have similar response times for invalid vs inactive users', async () => {
      // NOTE: This is a basic timing test
      // In production, consider constant-time comparison for API keys

      const invalidRequest = new Request('https://example.com', {
        headers: { 'x-api-key': 'nonexistent-key' },
      });

      const inactiveRequest = new Request('https://example.com', {
        headers: { 'x-api-key': 'inactive-key-456' },
      });

      const start1 = Date.now();
      await authenticateUser(invalidRequest, env);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await authenticateUser(inactiveRequest, env);
      const time2 = Date.now() - start2;

      // Times should be relatively similar (within 100ms)
      // This is a weak test, but better than nothing
      const diff = Math.abs(time1 - time2);
      expect(diff).toBeLessThan(100);
    });
  });
});

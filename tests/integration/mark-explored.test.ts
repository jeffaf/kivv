// =============================================================================
// kivv - mark_explored Tool Integration Tests
// =============================================================================
// COMPREHENSIVE TEST COVERAGE:
// - Happy path (create new status, update existing status)
// - Individual field updates (explored, bookmarked, notes)
// - Multiple field updates
// - Toggle behavior (true → false → true)
// - read_at timestamp updates
// - Security (401 without auth, user isolation, paper existence)
// - Edge cases (missing paper_id, non-existent paper, special chars, null notes)
// =============================================================================

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../mcp-server/src/index';

// =============================================================================
// Test Fixtures
// =============================================================================

// Test users
const USER1_API_KEY = 'test-user-1-api-key-abcd1234';
const USER2_API_KEY = 'test-user-2-api-key-efgh5678';
const INACTIVE_USER_API_KEY = 'inactive-user-api-key-xyz9999';

// Helper to create test request
function createRequest(apiKey: string | null, body: object = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey !== null) {
    headers['x-api-key'] = apiKey;
  }

  return new Request('https://test.com/mcp/tools/mark_explored', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Database Setup Helpers
// =============================================================================

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
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS papers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        arxiv_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        authors TEXT NOT NULL,
        abstract TEXT NOT NULL,
        categories TEXT NOT NULL,
        published_date TEXT NOT NULL,
        pdf_url TEXT NOT NULL,
        r2_key TEXT,
        summary TEXT,
        summary_generated_at TEXT,
        summary_model TEXT,
        relevance_score REAL,
        content_hash TEXT,
        collected_for_user_id INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS user_paper_status (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
        explored BOOLEAN DEFAULT 0,
        bookmarked BOOLEAN DEFAULT 0,
        notes TEXT,
        read_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, paper_id)
      )
    `),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_papers_arxiv_id ON papers(arxiv_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_user_paper_status_user_id ON user_paper_status(user_id)`)
  ]);
}

async function seedTestDatabase() {
  // Clean database first using batch
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_paper_status'),
    env.DB.prepare('DELETE FROM papers'),
    env.DB.prepare('DELETE FROM users')
  ]);

  // Create test users
  await env.DB.prepare(`
    INSERT INTO users (id, username, email, api_key, is_active)
    VALUES (1, 'testuser1', 'user1@example.com', ?, 1)
  `).bind(USER1_API_KEY).run();

  await env.DB.prepare(`
    INSERT INTO users (id, username, email, api_key, is_active)
    VALUES (2, 'testuser2', 'user2@example.com', ?, 1)
  `).bind(USER2_API_KEY).run();

  await env.DB.prepare(`
    INSERT INTO users (id, username, email, api_key, is_active)
    VALUES (3, 'inactive', 'inactive@example.com', ?, 0)
  `).bind(INACTIVE_USER_API_KEY).run();

  // Create test papers
  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (1, '2311.00001', 'Machine Learning Paper 1', '["Alice"]', 'Abstract 1', '["cs.LG"]', '2023-11-01', 'https://arxiv.org/pdf/2311.00001', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (2, '2311.00002', 'AI Safety Paper 2', '["Bob"]', 'Abstract 2', '["cs.AI"]', '2023-11-02', 'https://arxiv.org/pdf/2311.00002', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (3, '2311.00003', 'Quantum Computing Paper 3', '["Carol"]', 'Abstract 3', '["quant-ph"]', '2023-11-03', 'https://arxiv.org/pdf/2311.00003', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (4, '2311.00004', 'User 2 Paper', '["Dave"]', 'Abstract 4', '["cs.CL"]', '2023-11-04', 'https://arxiv.org/pdf/2311.00004', 2)
  `).run();

  // Create one existing user_paper_status entry (for update tests)
  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes, read_at, created_at)
    VALUES (1, 1, 0, 0, NULL, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')
  `).run();

  // User 2 has status for their paper
  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes, read_at, created_at)
    VALUES (2, 4, 1, 0, 'User 2 notes', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')
  `).run();
}

// =============================================================================
// Test Suite
// =============================================================================

describe('mark_explored Tool - Integration Tests', () => {
  beforeAll(async () => {
    await initializeSchema();
  });

  beforeEach(async () => {
    await seedTestDatabase();
  });

  // ===========================================================================
  // Happy Path - Create New Status
  // ===========================================================================

  it('should create new user_paper_status record when none exists', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 2,
      explored: true,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      paper_id: 2,
      status: {
        explored: true,
        bookmarked: false,
        notes: null,
      },
    });
    expect(json.status.read_at).toBeTruthy();

    // Verify in database
    const status = await env.DB
      .prepare('SELECT * FROM user_paper_status WHERE user_id = 1 AND paper_id = 2')
      .first();

    expect(status).toBeTruthy();
    expect(status!.explored).toBe(1);
    expect(status!.bookmarked).toBe(0);
    expect(status!.notes).toBe(null);
    expect(status!.read_at).toBeTruthy();
    expect(status!.created_at).toBeTruthy();
  });

  it('should create new status with all fields', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 3,
      explored: true,
      bookmarked: true,
      notes: 'Fascinating research!',
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      paper_id: 3,
      status: {
        explored: true,
        bookmarked: true,
        notes: 'Fascinating research!',
      },
    });
    expect(json.status.read_at).toBeTruthy();
  });

  // ===========================================================================
  // Happy Path - Update Existing Status
  // ===========================================================================

  it('should update existing user_paper_status record', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      explored: true,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      paper_id: 1,
      status: {
        explored: true,
        bookmarked: false,
        notes: null,
      },
    });

    // Verify database update
    const status = await env.DB
      .prepare('SELECT * FROM user_paper_status WHERE user_id = 1 AND paper_id = 1')
      .first();

    expect(status!.explored).toBe(1);
  });

  // ===========================================================================
  // Field Updates - Individual Fields
  // ===========================================================================

  it('should update only explored field', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      explored: true,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toMatchObject({
      explored: true,
      bookmarked: false,  // unchanged
      notes: null,        // unchanged
    });
  });

  it('should update only bookmarked field', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      bookmarked: true,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toMatchObject({
      explored: false,    // unchanged
      bookmarked: true,
      notes: null,        // unchanged
    });
  });

  it('should update only notes field', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: 'Important findings',
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toMatchObject({
      explored: false,    // unchanged
      bookmarked: false,  // unchanged
      notes: 'Important findings',
    });
  });

  it('should update multiple fields at once', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      explored: true,
      bookmarked: true,
      notes: 'Excellent paper',
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toMatchObject({
      explored: true,
      bookmarked: true,
      notes: 'Excellent paper',
    });
  });

  // ===========================================================================
  // Toggle Behavior
  // ===========================================================================

  it('should toggle explored from false to true', async () => {
    // Initial: explored = false
    let req = createRequest(USER1_API_KEY, { paper_id: 1, explored: true });
    let res = await app.fetch(req, env);
    let json = await res.json();
    expect(json.status.explored).toBe(true);

    // Toggle: explored = false
    req = createRequest(USER1_API_KEY, { paper_id: 1, explored: false });
    res = await app.fetch(req, env);
    json = await res.json();
    expect(json.status.explored).toBe(false);

    // Toggle: explored = true again
    req = createRequest(USER1_API_KEY, { paper_id: 1, explored: true });
    res = await app.fetch(req, env);
    json = await res.json();
    expect(json.status.explored).toBe(true);
  });

  it('should toggle bookmarked from false to true to false', async () => {
    let req = createRequest(USER1_API_KEY, { paper_id: 1, bookmarked: true });
    let res = await app.fetch(req, env);
    let json = await res.json();
    expect(json.status.bookmarked).toBe(true);

    req = createRequest(USER1_API_KEY, { paper_id: 1, bookmarked: false });
    res = await app.fetch(req, env);
    json = await res.json();
    expect(json.status.bookmarked).toBe(false);
  });

  it('should update notes multiple times', async () => {
    let req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: 'First note',
    });
    let res = await app.fetch(req, env);
    let json = await res.json();
    expect(json.status.notes).toBe('First note');

    req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: 'Second note',
    });
    res = await app.fetch(req, env);
    json = await res.json();
    expect(json.status.notes).toBe('Second note');

    req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: 'Third note',
    });
    res = await app.fetch(req, env);
    json = await res.json();
    expect(json.status.notes).toBe('Third note');
  });

  it('should clear notes by setting to null', async () => {
    // First add notes
    let req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: 'Some notes',
    });
    await app.fetch(req, env);

    // Then clear notes
    req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: null,
    });
    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(json.status.notes).toBe(null);

    // Verify in database
    const status = await env.DB
      .prepare('SELECT notes FROM user_paper_status WHERE user_id = 1 AND paper_id = 1')
      .first();

    expect(status!.notes).toBe(null);
  });

  // ===========================================================================
  // Timestamp Updates
  // ===========================================================================

  it('should update read_at timestamp on every modification', async () => {
    // Get initial timestamp
    const status1 = await env.DB
      .prepare('SELECT read_at FROM user_paper_status WHERE user_id = 1 AND paper_id = 1')
      .first();
    const initialReadAt = status1!.read_at;

    // Wait a tiny bit and update
    await new Promise(resolve => setTimeout(resolve, 10));

    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      explored: true,
    });
    await app.fetch(req, env);

    // Check timestamp changed
    const status2 = await env.DB
      .prepare('SELECT read_at FROM user_paper_status WHERE user_id = 1 AND paper_id = 1')
      .first();

    expect(status2!.read_at).not.toBe(initialReadAt);
    expect(new Date(status2!.read_at as string).getTime()).toBeGreaterThan(
      new Date(initialReadAt as string).getTime()
    );
  });

  it('should update read_at even with empty request body', async () => {
    const status1 = await env.DB
      .prepare('SELECT read_at FROM user_paper_status WHERE user_id = 1 AND paper_id = 1')
      .first();
    const initialReadAt = status1!.read_at;

    await new Promise(resolve => setTimeout(resolve, 10));

    // Send request with only paper_id, no field updates
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
    });
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);

    const status2 = await env.DB
      .prepare('SELECT read_at FROM user_paper_status WHERE user_id = 1 AND paper_id = 1')
      .first();

    expect(status2!.read_at).not.toBe(initialReadAt);
  });

  // ===========================================================================
  // Security Tests
  // ===========================================================================

  it('should return 401 without API key', async () => {
    const req = createRequest(null, { paper_id: 1, explored: true });
    const res = await app.fetch(req, env);

    expect(res.status).toBe(401);
  });

  it('should return 401 with invalid API key', async () => {
    const req = createRequest('invalid-api-key', { paper_id: 1, explored: true });
    const res = await app.fetch(req, env);

    expect(res.status).toBe(401);
  });

  it('should return 401 for inactive user', async () => {
    // Note: Auth middleware returns 401 for inactive users to prevent
    // information leakage about valid-but-inactive API keys
    const req = createRequest(INACTIVE_USER_API_KEY, { paper_id: 1, explored: true });
    const res = await app.fetch(req, env);

    expect(res.status).toBe(401);
  });

  it('should enforce user data isolation (user1 cannot modify user2 status)', async () => {
    // User 2 has paper 4 with status
    // User 1 tries to update User 2's paper
    const req = createRequest(USER1_API_KEY, {
      paper_id: 4,
      explored: true,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);

    // Should create NEW status for User 1, not modify User 2's
    const user1Status = await env.DB
      .prepare('SELECT * FROM user_paper_status WHERE user_id = 1 AND paper_id = 4')
      .first();

    const user2Status = await env.DB
      .prepare('SELECT * FROM user_paper_status WHERE user_id = 2 AND paper_id = 4')
      .first();

    // User 1 created their own status
    expect(user1Status).toBeTruthy();
    expect(user1Status!.explored).toBe(1);

    // User 2's status unchanged
    expect(user2Status).toBeTruthy();
    expect(user2Status!.explored).toBe(1);
    expect(user2Status!.notes).toBe('User 2 notes');
  });

  // ===========================================================================
  // Edge Cases - Validation
  // ===========================================================================

  it('should return 400 when paper_id is missing', async () => {
    const req = createRequest(USER1_API_KEY, {
      explored: true,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('paper_id');
  });

  it('should return 400 when paper_id is null', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: null,
      explored: true,
    });

    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
  });

  it('should return 400 when paper_id is not a number', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 'not-a-number',
      explored: true,
    });

    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
  });

  it('should return 400 when paper_id is not an integer', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1.5,
      explored: true,
    });

    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
  });

  it('should return 400 when paper_id is zero', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 0,
      explored: true,
    });

    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
  });

  it('should return 400 when paper_id is negative', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: -1,
      explored: true,
    });

    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
  });

  it('should return 404 when paper does not exist', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 99999,
      explored: true,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toContain('not found');
  });

  it('should return 400 for invalid JSON body', async () => {
    const req = new Request('https://test.com/mcp/tools/mark_explored', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': USER1_API_KEY,
      },
      body: 'invalid json{',
    });

    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
  });

  // ===========================================================================
  // Edge Cases - Special Characters
  // ===========================================================================

  it('should handle special characters in notes', async () => {
    const specialNotes = 'Test with "quotes" and \'apostrophes\' and <tags> and & symbols';

    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: specialNotes,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status.notes).toBe(specialNotes);

    // Verify in database
    const status = await env.DB
      .prepare('SELECT notes FROM user_paper_status WHERE user_id = 1 AND paper_id = 1')
      .first();

    expect(status!.notes).toBe(specialNotes);
  });

  it('should handle unicode characters in notes', async () => {
    const unicodeNotes = 'Testing emoji 🚀 and Chinese 中文 and math ∑∫√';

    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: unicodeNotes,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status.notes).toBe(unicodeNotes);
  });

  it('should handle very long notes', async () => {
    const longNotes = 'A'.repeat(5000);

    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: longNotes,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status.notes).toBe(longNotes);
  });

  it('should handle empty string notes', async () => {
    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: '',
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status.notes).toBe('');
  });

  // ===========================================================================
  // SQL Injection Prevention
  // ===========================================================================

  it('should prevent SQL injection in notes field', async () => {
    const sqlInjection = "'; DROP TABLE papers; --";

    const req = createRequest(USER1_API_KEY, {
      paper_id: 1,
      notes: sqlInjection,
    });

    const res = await app.fetch(req, env);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status.notes).toBe(sqlInjection);

    // Verify papers table still exists
    const papers = await env.DB
      .prepare('SELECT COUNT(*) as count FROM papers')
      .first();

    expect(papers!.count).toBeGreaterThan(0);
  });
});

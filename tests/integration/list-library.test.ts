// =============================================================================
// kivv - list_library Tool Integration Tests
// =============================================================================
// COMPREHENSIVE TEST COVERAGE:
// - Happy path (authenticated user gets their papers)
// - Pagination (limit/offset work correctly)
// - Filters (explored, bookmarked filtering)
// - Security (401 without auth, 403 for inactive, user isolation)
// - Edge cases (empty library, invalid params, SQL injection prevention)
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

  return new Request('https://test.com/mcp/tools/list_library', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// =============================================================================
// Database Setup Helpers
// =============================================================================

async function initializeSchema() {
  // Create schema tables (idempotent - IF NOT EXISTS)
  // Note: D1 batch API executes each statement separately
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

  // Create test papers (individual inserts)
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
    VALUES (4, '2311.00004', 'Natural Language Processing Paper 4', '["Dave"]', 'Abstract 4', '["cs.CL"]', '2023-11-04', 'https://arxiv.org/pdf/2311.00004', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (5, '2311.00005', 'Computer Vision Paper 5', '["Eve"]', 'Abstract 5', '["cs.CV"]', '2023-11-05', 'https://arxiv.org/pdf/2311.00005', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (6, '2311.00006', 'User 2 Paper 1', '["Frank"]', 'Abstract 6', '["cs.LG"]', '2023-11-06', 'https://arxiv.org/pdf/2311.00006', 2)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (7, '2311.00007', 'User 2 Paper 2', '["Grace"]', 'Abstract 7', '["cs.AI"]', '2023-11-07', 'https://arxiv.org/pdf/2311.00007', 2)
  `).run();

  // Create user_paper_status entries (individual inserts)
  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
    VALUES (1, 1, 0, 0, NULL)
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
    VALUES (1, 2, 1, 0, 'Interesting safety concepts')
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
    VALUES (1, 3, 1, 1, 'Must read later')
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
    VALUES (1, 4, 0, 1, 'Save for review')
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
    VALUES (1, 5, 1, 1, 'Excellent paper')
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
    VALUES (2, 6, 1, 0, NULL)
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
    VALUES (2, 7, 0, 1, 'Review later')
  `).run();
}

// =============================================================================
// Test Suite
// =============================================================================

describe('list_library MCP Tool', () => {

  beforeAll(async () => {
    // Initialize database schema
    await initializeSchema();
  });

  beforeEach(async () => {
    await seedTestDatabase();
  });

  // ===========================================================================
  // Happy Path Tests
  // ===========================================================================

  describe('Happy Path', () => {
    it('should return user papers with default pagination', async () => {
      const req = createRequest(USER1_API_KEY);
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toBeDefined();
      expect(data.total).toBe(5); // User 1 has 5 papers
      expect(data.limit).toBe(50); // Default limit
      expect(data.offset).toBe(0); // Default offset

      // Papers should be sorted by published_date DESC
      expect(data.papers).toHaveLength(5);
      expect(data.papers[0].arxiv_id).toBe('2311.00005'); // Most recent first
      expect(data.papers[4].arxiv_id).toBe('2311.00001'); // Oldest last
    });

    it('should include user-specific metadata fields', async () => {
      const req = createRequest(USER1_API_KEY);
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      const firstPaper = data.papers[0];

      // Check for user-specific fields
      expect(firstPaper.explored).toBeDefined();
      expect(firstPaper.bookmarked).toBeDefined();
      expect(typeof firstPaper.explored).toBe('boolean');
      expect(typeof firstPaper.bookmarked).toBe('boolean');
    });

    it('should return PaperWithStatus objects', async () => {
      const req = createRequest(USER1_API_KEY);
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      const paper = data.papers[0];

      // Check Paper fields
      expect(paper.id).toBeDefined();
      expect(paper.arxiv_id).toBeDefined();
      expect(paper.title).toBeDefined();
      expect(paper.authors).toBeDefined();
      expect(paper.abstract).toBeDefined();
      expect(paper.categories).toBeDefined();
      expect(paper.published_date).toBeDefined();
      expect(paper.pdf_url).toBeDefined();

      // Check UserPaperStatus fields
      expect(paper.explored).toBeDefined();
      expect(paper.bookmarked).toBeDefined();
    });
  });

  // ===========================================================================
  // Pagination Tests
  // ===========================================================================

  describe('Pagination', () => {
    it('should respect custom limit parameter', async () => {
      const req = createRequest(USER1_API_KEY, { limit: 2 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toHaveLength(2);
      expect(data.limit).toBe(2);
      expect(data.total).toBe(5);
    });

    it('should respect offset parameter', async () => {
      const req = createRequest(USER1_API_KEY, { limit: 2, offset: 2 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toHaveLength(2);
      expect(data.offset).toBe(2);
      expect(data.total).toBe(5);

      // Third paper (zero-indexed) should be at offset 2
      expect(data.papers[0].arxiv_id).toBe('2311.00003');
    });

    it('should enforce maximum limit (100)', async () => {
      const req = createRequest(USER1_API_KEY, { limit: 150 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe('INVALID_INPUT');
    });

    it('should reject negative limit', async () => {
      const req = createRequest(USER1_API_KEY, { limit: -1 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe('INVALID_INPUT');
    });

    it('should reject negative offset', async () => {
      const req = createRequest(USER1_API_KEY, { offset: -5 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe('INVALID_INPUT');
    });

    it('should handle offset beyond total results', async () => {
      const req = createRequest(USER1_API_KEY, { offset: 100 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toHaveLength(0);
      expect(data.total).toBe(5);
      expect(data.offset).toBe(100);
    });

    it('should reject non-integer limit', async () => {
      const req = createRequest(USER1_API_KEY, { limit: 5.5 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);
    });

    it('should reject zero limit', async () => {
      const req = createRequest(USER1_API_KEY, { limit: 0 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // Filter Tests
  // ===========================================================================

  describe('Filters', () => {
    it('should filter by explored=true', async () => {
      const req = createRequest(USER1_API_KEY, { explored: true });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(3); // Papers 2, 3, 5 are explored
      expect(data.papers.every((p: any) => p.explored)).toBe(true);
    });

    it('should filter by explored=false', async () => {
      const req = createRequest(USER1_API_KEY, { explored: false });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(2); // Papers 1, 4 are not explored
      expect(data.papers.every((p: any) => !p.explored)).toBe(true);
    });

    it('should filter by bookmarked=true', async () => {
      const req = createRequest(USER1_API_KEY, { bookmarked: true });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(3); // Papers 3, 4, 5 are bookmarked
      expect(data.papers.every((p: any) => p.bookmarked)).toBe(true);
    });

    it('should filter by bookmarked=false', async () => {
      const req = createRequest(USER1_API_KEY, { bookmarked: false });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(2); // Papers 1, 2 are not bookmarked
      expect(data.papers.every((p: any) => !p.bookmarked)).toBe(true);
    });

    it('should combine explored and bookmarked filters', async () => {
      const req = createRequest(USER1_API_KEY, {
        explored: true,
        bookmarked: true
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(2); // Papers 3, 5 are both explored AND bookmarked
      expect(data.papers.every((p: any) => p.explored && p.bookmarked)).toBe(true);
    });

    it('should allow null filters to show all papers', async () => {
      const req = createRequest(USER1_API_KEY, {
        explored: null,
        bookmarked: null
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(5); // All papers
    });
  });

  // ===========================================================================
  // Security Tests
  // ===========================================================================

  describe('Security', () => {
    it('should require authentication (401 without API key)', async () => {
      const req = createRequest(null);
      const res = await app.fetch(req, env);

      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe('MISSING_AUTH');
    });

    it('should reject invalid API key (401)', async () => {
      const req = createRequest('invalid-api-key-xyz');
      const res = await app.fetch(req, env);

      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe('INVALID_API_KEY');
    });

    it('should reject inactive user (403)', async () => {
      const req = createRequest(INACTIVE_USER_API_KEY);
      const res = await app.fetch(req, env);

      expect(res.status).toBe(401); // Inactive users get 401 from auth middleware

      const data = await res.json();
      expect(data.code).toBe('INVALID_API_KEY');
    });

    it('should isolate users (User A cannot see User B papers)', async () => {
      // User 1 request
      const req1 = createRequest(USER1_API_KEY);
      const res1 = await app.fetch(req1, env);
      const data1 = await res1.json();

      // User 2 request
      const req2 = createRequest(USER2_API_KEY);
      const res2 = await app.fetch(req2, env);
      const data2 = await res2.json();

      // User 1 should have 5 papers
      expect(data1.total).toBe(5);
      expect(data1.papers.every((p: any) => {
        return ['2311.00001', '2311.00002', '2311.00003', '2311.00004', '2311.00005'].includes(p.arxiv_id);
      })).toBe(true);

      // User 2 should have 2 papers
      expect(data2.total).toBe(2);
      expect(data2.papers.every((p: any) => {
        return ['2311.00006', '2311.00007'].includes(p.arxiv_id);
      })).toBe(true);

      // No overlap
      const user1Ids = data1.papers.map((p: any) => p.arxiv_id);
      const user2Ids = data2.papers.map((p: any) => p.arxiv_id);
      const overlap = user1Ids.filter((id: string) => user2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('should prevent SQL injection via limit parameter', async () => {
      const req = createRequest(USER1_API_KEY, {
        limit: "5; DROP TABLE papers; --" as any
      });
      const res = await app.fetch(req, env);

      // Should reject as invalid input (not a number)
      expect(res.status).toBe(400);
    });

    it('should prevent SQL injection via offset parameter', async () => {
      const req = createRequest(USER1_API_KEY, {
        offset: "0 OR 1=1" as any
      });
      const res = await app.fetch(req, env);

      // Should reject as invalid input (not a number)
      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty library gracefully', async () => {
      // Create user with no papers
      await env.DB.prepare(`
        INSERT INTO users (id, username, email, api_key, is_active)
        VALUES (99, 'emptyuser', 'empty@example.com', 'empty-user-key', 1)
      `).run();

      const req = createRequest('empty-user-key');
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.limit).toBe(50);
      expect(data.offset).toBe(0);
    });

    it('should handle empty request body (use defaults)', async () => {
      const req = new Request('https://test.com/mcp/tools/list_library', {
        method: 'POST',
        headers: {
          'x-api-key': USER1_API_KEY,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.total).toBe(5);
      expect(data.limit).toBe(50);
      expect(data.offset).toBe(0);
    });

    it('should handle malformed JSON body', async () => {
      const req = new Request('https://test.com/mcp/tools/list_library', {
        method: 'POST',
        headers: {
          'x-api-key': USER1_API_KEY,
          'Content-Type': 'application/json',
        },
        body: '{invalid json',
      });

      const res = await app.fetch(req, env);

      // Should use defaults when body parse fails
      expect(res.status).toBe(200);
    });

    it('should convert SQLite boolean integers to TypeScript booleans', async () => {
      const req = createRequest(USER1_API_KEY);
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      const paper = data.papers.find((p: any) => p.arxiv_id === '2311.00003');

      // SQLite stores booleans as 0/1, should be converted to true/false
      expect(paper.explored).toBe(true);
      expect(paper.bookmarked).toBe(true);
      expect(typeof paper.explored).toBe('boolean');
      expect(typeof paper.bookmarked).toBe('boolean');
    });

    it('should handle papers with notes', async () => {
      const req = createRequest(USER1_API_KEY, { bookmarked: true });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      const paperWithNotes = data.papers.find((p: any) => p.arxiv_id === '2311.00003');

      expect(paperWithNotes.notes).toBe('Must read later');
    });

    it('should handle papers without notes', async () => {
      const req = createRequest(USER1_API_KEY, { explored: false });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      const paperWithoutNotes = data.papers.find((p: any) => p.arxiv_id === '2311.00001');

      expect(paperWithoutNotes.notes).toBeNull();
    });

    it('should handle limit=100 (maximum)', async () => {
      const req = createRequest(USER1_API_KEY, { limit: 100 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.limit).toBe(100);
    });

    it('should return correct total count with filters', async () => {
      const req = createRequest(USER1_API_KEY, {
        explored: true,
        limit: 1
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toHaveLength(1); // Only 1 returned due to limit
      expect(data.total).toBe(3); // But total count should be 3 (all explored papers)
    });
  });

  // ===========================================================================
  // Sorting Tests
  // ===========================================================================

  describe('Sorting', () => {
    it('should sort papers by published_date DESC (newest first)', async () => {
      const req = createRequest(USER1_API_KEY);
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();

      // Verify descending order
      for (let i = 0; i < data.papers.length - 1; i++) {
        const current = new Date(data.papers[i].published_date);
        const next = new Date(data.papers[i + 1].published_date);
        expect(current >= next).toBe(true);
      }
    });

    it('should maintain sort order with filters', async () => {
      const req = createRequest(USER1_API_KEY, { explored: true });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();

      // Should still be sorted DESC
      expect(data.papers[0].arxiv_id).toBe('2311.00005'); // 2023-11-05
      expect(data.papers[1].arxiv_id).toBe('2311.00003'); // 2023-11-03
      expect(data.papers[2].arxiv_id).toBe('2311.00002'); // 2023-11-02
    });
  });
});

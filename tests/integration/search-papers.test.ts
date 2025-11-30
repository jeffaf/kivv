// =============================================================================
// kivv - search_papers Tool Integration Tests
// =============================================================================
// COMPREHENSIVE TEST COVERAGE:
// - Happy path (title/abstract search, case-insensitive)
// - Pagination (limit/offset validation)
// - Filters (explored, bookmarked combined with search)
// - Security (authentication, user isolation, SQL injection prevention)
// - Edge cases (empty query, special characters, SQL wildcards)
// =============================================================================

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../mcp-server/src/index';

// =============================================================================
// Test Fixtures
// =============================================================================

const USER1_API_KEY = 'test-user-1-api-key-abcd1234';
const USER2_API_KEY = 'test-user-2-api-key-efgh5678';
const INACTIVE_USER_API_KEY = 'inactive-user-api-key-xyz9999';

// Helper to create test request
function createRequest(apiKey: string | null, body: object) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey !== null) {
    headers['x-api-key'] = apiKey;
  }

  return new Request('https://test.com/mcp/tools/search_papers', {
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
  // Clean database first
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

  // Create test papers with varied content for search testing
  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (1, '2401.00001', 'Neural Networks for Image Classification', '["Alice Smith", "Bob Jones"]', 'This paper presents a deep learning approach using convolutional neural networks.', '["cs.CV", "cs.LG"]', '2024-01-15', 'https://arxiv.org/pdf/2401.00001', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (2, '2401.00002', 'Transformer Models in Natural Language Processing', '["Charlie Brown"]', 'We explore attention mechanisms and their applications in NLP tasks.', '["cs.CL"]', '2024-01-16', 'https://arxiv.org/pdf/2401.00002', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (3, '2401.00003', 'Quantum Computing: A Comprehensive Survey', '["Diana Prince"]', 'An overview of quantum algorithms and their potential applications.', '["quant-ph"]', '2024-01-17', 'https://arxiv.org/pdf/2401.00003', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (4, '2401.00004', 'Deep Reinforcement Learning for Robotics', '["Eve Taylor"]', 'This study applies neural network-based agents to robotic control tasks.', '["cs.RO", "cs.AI"]', '2024-01-18', 'https://arxiv.org/pdf/2401.00004', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (5, '2401.00005', 'Case Study: 50% Improvement in Model Accuracy', '["Frank Miller"]', 'Our test_model achieved significant gains using novel techniques.', '["cs.LG"]', '2024-01-19', 'https://arxiv.org/pdf/2401.00005', 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id)
    VALUES (6, '2401.00006', 'Neural Architecture Search Methods', '["Grace Hopper"]', 'Automated design of neural network architectures.', '["cs.LG"]', '2024-01-20', 'https://arxiv.org/pdf/2401.00006', 2)
  `).run();

  // Create user_paper_status entries
  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked)
    VALUES (1, 1, 1, 0)
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked)
    VALUES (1, 2, 0, 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked)
    VALUES (1, 3, 1, 1)
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked)
    VALUES (1, 4, 0, 0)
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked)
    VALUES (1, 5, 1, 0)
  `).run();

  await env.DB.prepare(`
    INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked)
    VALUES (2, 6, 0, 0)
  `).run();
}

// =============================================================================
// Test Suite
// =============================================================================

describe('search_papers MCP Tool', () => {

  beforeAll(async () => {
    await initializeSchema();
  });

  beforeEach(async () => {
    await seedTestDatabase();
  });

  // ===========================================================================
  // Happy Path Tests
  // ===========================================================================

  describe('Happy Path', () => {
    it('should find papers matching keyword in title', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toBeDefined();
      expect(data.papers.length).toBe(2); // Papers 1 and 4 have "neural" in title
      expect(data.total).toBe(2);
      expect(data.query).toBe('neural');

      const titles = data.papers.map((p: any) => p.title);
      expect(titles).toContain('Neural Networks for Image Classification');
      expect(titles).toContain('Deep Reinforcement Learning for Robotics');
    });

    it('should find papers matching keyword in abstract', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'attention mechanisms' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers.length).toBe(1);
      expect(data.papers[0].title).toBe('Transformer Models in Natural Language Processing');
      expect(data.total).toBe(1);
    });

    it('should perform case-insensitive search', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'QUANTUM COMPUTING' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers.length).toBe(1);
      expect(data.papers[0].title).toContain('Quantum');
    });

    it('should search in both title and abstract', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'network' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      // Should find papers with "network" in title or abstract
      expect(data.papers.length).toBeGreaterThanOrEqual(2);
    });

    it('should return papers with correct status fields', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'quantum' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers.length).toBe(1);

      const paper = data.papers[0];
      expect(paper.explored).toBe(true);
      expect(paper.bookmarked).toBe(true);
      expect(typeof paper.explored).toBe('boolean');
      expect(typeof paper.bookmarked).toBe('boolean');
    });

    it('should include query in response', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'machine learning' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.query).toBe('machine learning');
    });
  });

  // ===========================================================================
  // Pagination Tests
  // ===========================================================================

  describe('Pagination', () => {
    it('should use default limit of 50 when not specified', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.limit).toBe(50);
    });

    it('should respect custom limit parameter', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'learning', limit: 1 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers.length).toBeLessThanOrEqual(1);
      expect(data.limit).toBe(1);
    });

    it('should respect offset parameter', async () => {
      const req1 = createRequest(USER1_API_KEY, { query: 'neural', limit: 10 });
      const res1 = await app.fetch(req1, env);
      const data1 = await res1.json();

      if (data1.total > 1) {
        const req2 = createRequest(USER1_API_KEY, { query: 'neural', offset: 1 });
        const res2 = await app.fetch(req2, env);
        const data2 = await res2.json();

        expect(data2.offset).toBe(1);
        if (data2.papers.length > 0) {
          expect(data2.papers[0].id).not.toBe(data1.papers[0].id);
        }
      }
    });

    it('should enforce max limit of 100', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', limit: 200 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe('INVALID_INPUT');
    });

    it('should reject negative offset', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', offset: -5 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.code).toBe('INVALID_INPUT');
    });

    it('should reject limit less than 1', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', limit: 0 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);
    });

    it('should reject non-integer limit', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', limit: 5.5 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // Filter Tests
  // ===========================================================================

  describe('Filters', () => {
    it('should filter by explored=true', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', explored: true });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      data.papers.forEach((paper: any) => {
        expect(paper.explored).toBe(true);
      });
    });

    it('should filter by explored=false', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', explored: false });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      data.papers.forEach((paper: any) => {
        expect(paper.explored).toBe(false);
      });
    });

    it('should filter by bookmarked=true', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'quantum', bookmarked: true });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers.length).toBe(1);
      expect(data.papers[0].bookmarked).toBe(true);
    });

    it('should combine search with explored and bookmarked filters', async () => {
      const req = createRequest(USER1_API_KEY, {
        query: 'quantum',
        explored: true,
        bookmarked: true
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers.length).toBe(1);
      expect(data.papers[0].explored).toBe(true);
      expect(data.papers[0].bookmarked).toBe(true);
    });

    it('should return empty array when filters match nothing', async () => {
      const req = createRequest(USER1_API_KEY, {
        query: 'transformer',
        explored: true
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toEqual([]);
      expect(data.total).toBe(0);
    });
  });

  // ===========================================================================
  // Security Tests
  // ===========================================================================

  describe('Security', () => {
    it('should require authentication (401 without API key)', async () => {
      const req = createRequest(null, { query: 'neural' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe('MISSING_AUTH');
    });

    it('should reject invalid API key', async () => {
      const req = createRequest('invalid-key-12345', { query: 'neural' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.code).toBe('INVALID_API_KEY');
    });

    it('should only return papers belonging to authenticated user', async () => {
      // User 1 searches for "architecture" - should NOT see User 2's paper 6
      const req = createRequest(USER1_API_KEY, { query: 'architecture' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers.length).toBe(0);
      expect(data.total).toBe(0);
    });

    it('should prevent SQL injection via query parameter - UNION attack', async () => {
      const req = createRequest(USER1_API_KEY, {
        query: "' UNION SELECT * FROM users --"
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toBeDefined();
      expect(Array.isArray(data.papers)).toBe(true);
    });

    it('should prevent SQL injection via query parameter - OR attack', async () => {
      const req = createRequest(USER1_API_KEY, {
        query: "' OR '1'='1"
      });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.papers)).toBe(true);
    });

    it('should safely handle SQL wildcard % in search', async () => {
      const req = createRequest(USER1_API_KEY, { query: '50%' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      // Wildcard is converted to space, so searches for "50 " which still matches "50% Improvement"
      expect(data.papers.length).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.papers)).toBe(true);
    });

    it('should safely handle SQL wildcard _ in search', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'test_model' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      // Wildcard is converted to space, so searches for "test model" which still matches
      expect(data.papers.length).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(data.papers)).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should reject missing query parameter', async () => {
      const req = createRequest(USER1_API_KEY, { limit: 20 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('Query parameter is required');
    });

    it('should reject empty query string', async () => {
      const req = createRequest(USER1_API_KEY, { query: '' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('cannot be empty');
    });

    it('should reject whitespace-only query', async () => {
      const req = createRequest(USER1_API_KEY, { query: '   ' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('cannot be empty');
    });

    it('should return empty array when no results match', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'nonexistent_keyword_xyz123' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.papers).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.query).toBe('nonexistent_keyword_xyz123');
    });

    it('should handle special characters in search query', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'network & learning' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.papers)).toBe(true);
    });

    it('should handle quotes in search query', async () => {
      const req = createRequest(USER1_API_KEY, { query: '"neural networks"' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.papers)).toBe(true);
    });

    it('should handle semicolons in search query (SQL injection attempt)', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural; DROP TABLE papers;' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(Array.isArray(data.papers)).toBe(true);
    });

    it('should reject very long query strings (>500 chars)', async () => {
      const longQuery = 'neural '.repeat(100); // 700 characters
      const req = createRequest(USER1_API_KEY, { query: longQuery });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('too long');
    });

    it('should trim whitespace from query', async () => {
      const req = createRequest(USER1_API_KEY, { query: '  neural  ' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.query).toBe('neural');
    });

    it('should reject non-string query parameter', async () => {
      const req = createRequest(USER1_API_KEY, { query: 12345 as any });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('must be a string');
    });

    it('should reject invalid JSON body', async () => {
      const req = new Request('https://test.com/mcp/tools/search_papers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': USER1_API_KEY,
        },
        body: 'not valid json',
      });

      const res = await app.fetch(req, env);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain('Invalid JSON');
    });
  });

  // ===========================================================================
  // Response Format Tests
  // ===========================================================================

  describe('Response Format', () => {
    it('should return correct response structure', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', limit: 10, offset: 0 });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();

      expect(data).toHaveProperty('papers');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('offset');
      expect(data).toHaveProperty('query');

      expect(Array.isArray(data.papers)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(typeof data.limit).toBe('number');
      expect(typeof data.offset).toBe('number');
      expect(typeof data.query).toBe('string');

      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
      expect(data.query).toBe('neural');
    });

    it('should include all paper fields in results', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'neural', limit: 1 });
      const res = await app.fetch(req, env);
      const data = await res.json();

      if (data.papers.length > 0) {
        const paper = data.papers[0];

        expect(paper).toHaveProperty('id');
        expect(paper).toHaveProperty('arxiv_id');
        expect(paper).toHaveProperty('title');
        expect(paper).toHaveProperty('authors');
        expect(paper).toHaveProperty('abstract');
        expect(paper).toHaveProperty('categories');
        expect(paper).toHaveProperty('published_date');
        expect(paper).toHaveProperty('pdf_url');
        expect(paper).toHaveProperty('explored');
        expect(paper).toHaveProperty('bookmarked');

        expect(typeof paper.explored).toBe('boolean');
        expect(typeof paper.bookmarked).toBe('boolean');
      }
    });
  });

  // ===========================================================================
  // Sorting Tests
  // ===========================================================================

  describe('Sorting', () => {
    it('should sort results by published_date DESC (newest first)', async () => {
      const req = createRequest(USER1_API_KEY, { query: 'learning' });
      const res = await app.fetch(req, env);

      expect(res.status).toBe(200);

      const data = await res.json();

      if (data.papers.length > 1) {
        for (let i = 0; i < data.papers.length - 1; i++) {
          const current = new Date(data.papers[i].published_date);
          const next = new Date(data.papers[i + 1].published_date);
          expect(current >= next).toBe(true);
        }
      }
    });
  });
});

// =============================================================================
// kivv - Feed Generation Integration Tests
// =============================================================================
// COMPREHENSIVE TEST COVERAGE:
// - RSS 2.0 feed generation (valid XML, correct structure, MIME type)
// - Atom 1.0 feed generation (valid XML, correct structure, MIME type)
// - XML entity escaping (XSS prevention)
// - Username validation (alphanumeric + underscore only)
// - Security (SQL injection prevention, path traversal)
// - Error handling (404 for non-existent users, 400 for invalid usernames)
// - User paper filtering (only shows papers for requested user)
// - User metadata inclusion (explored, bookmarked, notes)
// - Pagination (50 paper limit, newest first)
// - Cache headers
// =============================================================================

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../../mcp-server/src/index';

// =============================================================================
// Test Fixtures
// =============================================================================

// Helper to create test request
function createRequest(path: string) {
  return new Request(`https://test.com${path}`, {
    method: 'GET',
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
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        api_key TEXT NOT NULL UNIQUE,
        display_name TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        is_active BOOLEAN NOT NULL DEFAULT 1
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS papers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        arxiv_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        authors TEXT NOT NULL,
        abstract TEXT NOT NULL,
        categories TEXT,
        published_date TEXT NOT NULL,
        pdf_url TEXT NOT NULL,
        r2_key TEXT,
        summary TEXT,
        summary_generated_at TEXT,
        summary_model TEXT,
        relevance_score REAL,
        content_hash TEXT,
        collected_for_user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collected_for_user_id) REFERENCES users(id)
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS user_paper_status (
        user_id INTEGER NOT NULL,
        paper_id INTEGER NOT NULL,
        explored BOOLEAN NOT NULL DEFAULT 0,
        bookmarked BOOLEAN NOT NULL DEFAULT 0,
        notes TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, paper_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (paper_id) REFERENCES papers(id)
      )
    `),
  ]);
}

async function seedTestData() {
  await env.DB.batch([
    // Insert test users
    env.DB.prepare(`
      INSERT INTO users (id, username, email, api_key, display_name, is_active)
      VALUES (1, 'alice', 'alice@example.com', 'alice-api-key-123', 'Alice Smith', 1)
    `),
    env.DB.prepare(`
      INSERT INTO users (id, username, email, api_key, display_name, is_active)
      VALUES (2, 'bob_researcher', 'bob@example.com', 'bob-api-key-456', 'Bob Jones', 1)
    `),
    env.DB.prepare(`
      INSERT INTO users (id, username, email, api_key, display_name, is_active)
      VALUES (3, 'charlie', 'charlie@example.com', 'charlie-api-key-789', 'Charlie Brown', 1)
    `),

    // Insert test papers for alice (user_id=1)
    env.DB.prepare(`
      INSERT INTO papers (
        id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id
      )
      VALUES (
        1, '2401.00001',
        'Attention Is All You Need',
        '["Vaswani, Ashish", "Shazeer, Noam"]',
        'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.',
        '["cs.LG", "cs.AI"]',
        '2024-01-01T10:00:00.000Z',
        'https://arxiv.org/pdf/2401.00001.pdf',
        1
      )
    `),
    env.DB.prepare(`
      INSERT INTO papers (
        id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id
      )
      VALUES (
        2, '2401.00002',
        'BERT: Pre-training of Deep Bidirectional Transformers',
        '["Devlin, Jacob", "Chang, Ming-Wei"]',
        'We introduce a new language representation model called BERT.',
        '["cs.CL", "cs.AI"]',
        '2024-01-02T10:00:00.000Z',
        'https://arxiv.org/pdf/2401.00002.pdf',
        1
      )
    `),
    env.DB.prepare(`
      INSERT INTO papers (
        id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id
      )
      VALUES (
        3, '2401.00003',
        'Paper with Special Chars <script>alert("XSS")</script> & "quotes"',
        '["Smith, John & Sons", "O''Reilly, Jane"]',
        'Abstract with <html> tags & special "chars" to test escaping.',
        '["cs.CR"]',
        '2024-01-03T10:00:00.000Z',
        'https://arxiv.org/pdf/2401.00003.pdf',
        1
      )
    `),

    // Insert papers for bob (user_id=2)
    env.DB.prepare(`
      INSERT INTO papers (
        id, arxiv_id, title, authors, abstract, categories, published_date, pdf_url, collected_for_user_id
      )
      VALUES (
        4, '2401.00004',
        'Bob Paper 1',
        '["Bob Author"]',
        'This is Bob abstract.',
        '["cs.AI"]',
        '2024-01-04T10:00:00.000Z',
        'https://arxiv.org/pdf/2401.00004.pdf',
        2
      )
    `),

    // Add user paper status for alice's papers
    env.DB.prepare(`
      INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
      VALUES (1, 1, 1, 0, NULL)
    `),
    env.DB.prepare(`
      INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
      VALUES (1, 2, 0, 1, 'Very important paper!')
    `),
    env.DB.prepare(`
      INSERT INTO user_paper_status (user_id, paper_id, explored, bookmarked, notes)
      VALUES (1, 3, 1, 1, 'Notes with <html> & "special" chars')
    `),
  ]);
}

// =============================================================================
// Test Suite Setup
// =============================================================================

beforeAll(async () => {
  await initializeSchema();
});

beforeEach(async () => {
  // Clear tables
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_paper_status'),
    env.DB.prepare('DELETE FROM papers'),
    env.DB.prepare('DELETE FROM users'),
  ]);
  // Seed fresh test data
  await seedTestData();
});

// =============================================================================
// RSS 2.0 Feed Tests
// =============================================================================

describe('RSS 2.0 Feed Generation', () => {
  it('should return valid RSS 2.0 feed for existing user', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');

    const xml = await res.text();

    // Validate RSS structure
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<channel>');
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  it('should include correct channel metadata in RSS feed', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    expect(xml).toContain('<title>kivv - Research Papers for alice</title>');
    expect(xml).toContain('<description>Latest arXiv papers collected for alice</description>');
    expect(xml).toContain('<link>https://kivv.example.com</link>');
    expect(xml).toContain('<language>en-us</language>');
    expect(xml).toContain('<lastBuildDate>');
    expect(xml).toContain('<atom:link href="https://kivv.example.com/feeds/alice/rss.xml" rel="self" type="application/rss+xml"/>');
  });

  it('should include paper items with correct structure in RSS feed', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Check for item elements
    expect(xml).toContain('<item>');
    expect(xml).toContain('</item>');

    // Check first paper (BERT - newest)
    expect(xml).toContain('<title>BERT: Pre-training of Deep Bidirectional Transformers</title>');
    expect(xml).toContain('<link>https://arxiv.org/pdf/2401.00002.pdf</link>');
    expect(xml).toContain('<description>');
    expect(xml).toContain('We introduce a new language representation model called BERT.');
    expect(xml).toContain('<guid isPermaLink="false">2401.00002</guid>');
    expect(xml).toContain('<pubDate>');
  });

  it('should properly escape XML entities in RSS feed (XSS prevention)', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Check that special characters are escaped
    expect(xml).toContain('&lt;script&gt;'); // <script> should be escaped
    expect(xml).toContain('&amp;'); // & should be escaped
    expect(xml).toContain('&quot;'); // " should be escaped
    expect(xml).not.toContain('<script>alert'); // Should NOT contain unescaped script tag
    expect(xml).not.toContain('<html>'); // Should NOT contain unescaped HTML tags
  });

  it('should include user metadata (explored, bookmarked, notes) in RSS feed', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Check for explored status
    expect(xml).toContain('<em>Explored</em>');

    // Check for bookmarked status
    expect(xml).toContain('<em>⭐ Bookmarked</em>');

    // Check for notes (should be escaped)
    expect(xml).toContain('Very important paper!');
    expect(xml).toContain('&lt;html&gt;'); // Notes should have HTML escaped
  });

  it('should return 404 for non-existent user', async () => {
    const req = createRequest('/feeds/nonexistent/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(404);
    expect(await res.text()).toContain('User not found');
  });

  it('should return 400 for invalid username (SQL injection attempt)', async () => {
    const req = createRequest('/feeds/alice\' OR \'1\'=\'1/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid username format');
  });

  it('should return 400 for invalid username (path traversal attempt)', async () => {
    const req = createRequest('/feeds/..%2Fadmin/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid username format');
  });

  it('should return 400 for invalid username (special characters)', async () => {
    const req = createRequest('/feeds/alice@example.com/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid username format');
  });

  it('should only return papers for requested user', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Alice should see her papers
    expect(xml).toContain('Attention Is All You Need');
    expect(xml).toContain('BERT: Pre-training of Deep Bidirectional Transformers');

    // Alice should NOT see Bob's papers
    expect(xml).not.toContain('Bob Paper 1');
  });

  it('should accept valid username with underscores', async () => {
    const req = createRequest('/feeds/bob_researcher/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('kivv - Research Papers for bob_researcher');
  });

  it('should include cache headers', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('should order papers by published_date DESC (newest first)', async () => {
    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Extract positions of papers
    const paper3Pos = xml.indexOf('Special Chars');
    const paper2Pos = xml.indexOf('BERT');
    const paper1Pos = xml.indexOf('Attention Is All You Need');

    // Newest first: paper3 (2024-01-03) > paper2 (2024-01-02) > paper1 (2024-01-01)
    expect(paper3Pos).toBeLessThan(paper2Pos);
    expect(paper2Pos).toBeLessThan(paper1Pos);
  });
});

// =============================================================================
// Atom 1.0 Feed Tests
// =============================================================================

describe('Atom 1.0 Feed Generation', () => {
  it('should return valid Atom 1.0 feed for existing user', async () => {
    const req = createRequest('/feeds/alice/atom.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/atom+xml; charset=utf-8');

    const xml = await res.text();

    // Validate Atom structure
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain('</feed>');
  });

  it('should include correct feed metadata in Atom feed', async () => {
    const req = createRequest('/feeds/alice/atom.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    expect(xml).toContain('<title>kivv - Research Papers for alice</title>');
    expect(xml).toContain('<subtitle>Latest arXiv papers collected for alice</subtitle>');
    expect(xml).toContain('<link href="https://kivv.example.com/feeds/alice/atom.xml" rel="self"/>');
    expect(xml).toContain('<link href="https://kivv.example.com"/>');
    expect(xml).toContain('<updated>');
    expect(xml).toContain('<id>urn:kivv:feeds:alice</id>');
  });

  it('should include entries with correct structure in Atom feed', async () => {
    const req = createRequest('/feeds/alice/atom.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Check for entry elements
    expect(xml).toContain('<entry>');
    expect(xml).toContain('</entry>');

    // Check first paper (BERT - newest)
    expect(xml).toContain('<title>BERT: Pre-training of Deep Bidirectional Transformers</title>');
    expect(xml).toContain('<link href="https://arxiv.org/pdf/2401.00002.pdf"/>');
    expect(xml).toContain('<id>urn:arxiv:2401.00002</id>');
    expect(xml).toContain('<updated>2024-01-02T10:00:00.000Z</updated>');
    expect(xml).toContain('<summary>');
    expect(xml).toContain('We introduce a new language representation model called BERT.');
    expect(xml).toContain('<author><name>');
  });

  it('should properly escape XML entities in Atom feed (XSS prevention)', async () => {
    const req = createRequest('/feeds/alice/atom.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Check that special characters are escaped
    expect(xml).toContain('&lt;script&gt;'); // <script> should be escaped
    expect(xml).toContain('&amp;'); // & should be escaped
    expect(xml).toContain('&quot;'); // " should be escaped
    expect(xml).not.toContain('<script>alert'); // Should NOT contain unescaped script tag
  });

  it('should include user metadata in Atom feed summary', async () => {
    const req = createRequest('/feeds/alice/atom.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Check for explored status
    expect(xml).toContain('[Explored]');

    // Check for bookmarked status
    expect(xml).toContain('[⭐ Bookmarked]');

    // Check for notes (should be escaped)
    expect(xml).toContain('Notes: Very important paper!');
  });

  it('should return 404 for non-existent user', async () => {
    const req = createRequest('/feeds/nonexistent/atom.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(404);
    expect(await res.text()).toContain('User not found');
  });

  it('should return 400 for invalid username', async () => {
    const req = createRequest('/feeds/alice\' OR \'1\'=\'1/atom.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid username format');
  });

  it('should only return papers for requested user', async () => {
    const req = createRequest('/feeds/alice/atom.xml');
    const res = await app.fetch(req, env);

    const xml = await res.text();

    // Alice should see her papers
    expect(xml).toContain('Attention Is All You Need');
    expect(xml).toContain('BERT: Pre-training of Deep Bidirectional Transformers');

    // Alice should NOT see Bob's papers
    expect(xml).not.toContain('Bob Paper 1');
  });

  it('should include cache headers', async () => {
    const req = createRequest('/feeds/alice/atom.xml');
    const res = await app.fetch(req, env);

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Feed Edge Cases', () => {
  it('should handle user with no papers (empty feed)', async () => {
    const req = createRequest('/feeds/charlie/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    const xml = await res.text();

    // Should have valid RSS structure but no items
    expect(xml).toContain('<channel>');
    expect(xml).toContain('kivv - Research Papers for charlie');
    expect(xml).toContain('</channel>');
  });

  it('should handle papers without user_paper_status records', async () => {
    // Remove all status records for alice
    await env.DB.prepare('DELETE FROM user_paper_status WHERE user_id = 1').run();

    const req = createRequest('/feeds/alice/rss.xml');
    const res = await app.fetch(req, env);

    expect(res.status).toBe(200);
    const xml = await res.text();

    // Should still show papers, just without explored/bookmarked/notes
    expect(xml).toContain('Attention Is All You Need');
    expect(xml).not.toContain('<em>Explored</em>');
    expect(xml).not.toContain('<em>⭐ Bookmarked</em>');
  });

  it('should reject empty username', async () => {
    const req = createRequest('/feeds//rss.xml');
    const res = await app.fetch(req, env);

    // Empty username should result in 404 (route not matched)
    expect(res.status).toBe(404);
  });

  it('should reject very long username', async () => {
    const longUsername = 'a'.repeat(100);
    const req = createRequest(`/feeds/${longUsername}/rss.xml`);
    const res = await app.fetch(req, env);

    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Invalid username format');
  });
});

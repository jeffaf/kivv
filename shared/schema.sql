-- =============================================================================
-- kivv - arXiv Research Assistant
-- Multi-User Database Schema for Cloudflare D1
-- =============================================================================
-- Version: 2.0
-- Created: 2025-11-30
-- Database: Cloudflare D1 (SQLite)
-- =============================================================================

-- =============================================================================
-- TABLES
-- =============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,        -- For MCP authentication
  display_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_login TEXT,
  is_active BOOLEAN DEFAULT 1
);

-- Topics table with user ownership
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL,
  arxiv_query TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1,
  relevance_threshold REAL DEFAULT 0.7,  -- Per-topic triage threshold
  max_papers_per_day INTEGER DEFAULT 50, -- Per-topic daily cap
  generate_summaries BOOLEAN DEFAULT 1,  -- Toggle summaries on/off
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_collection_at TEXT,
  last_cursor TEXT                       -- For batched pagination
);

-- Papers table with deduplication support
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arxiv_id TEXT UNIQUE NOT NULL,         -- UNIQUE constraint for deduplication
  title TEXT NOT NULL,
  authors TEXT NOT NULL,                 -- JSON array
  abstract TEXT NOT NULL,
  categories TEXT NOT NULL,              -- JSON array
  published_date TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  r2_key TEXT,

  -- Summary metadata
  summary TEXT,
  summary_generated_at TEXT,
  summary_model TEXT,                    -- e.g., "claude-3-5-sonnet-20241022"
  relevance_score REAL,                  -- Haiku triage score (0.0-1.0)

  -- Deduplication
  content_hash TEXT,                     -- sha256(title + abstract)

  -- Collection metadata
  collected_for_user_id INTEGER REFERENCES users(id),  -- Who collected this
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- User-specific paper metadata (exploration, bookmarks, notes)
CREATE TABLE IF NOT EXISTS user_paper_status (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  explored BOOLEAN DEFAULT 0,
  bookmarked BOOLEAN DEFAULT 0,
  notes TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, paper_id)
);

-- Cost tracking (for budget enforcement)
CREATE TABLE IF NOT EXISTS cost_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                    -- YYYY-MM-DD
  user_id INTEGER REFERENCES users(id),  -- NULL = system-wide
  service TEXT NOT NULL,                 -- 'haiku', 'sonnet'
  papers_processed INTEGER NOT NULL,
  tokens_input INTEGER NOT NULL,
  tokens_output INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- INDEXES (Performance Optimization)
-- =============================================================================

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Topics indexes (user isolation)
CREATE INDEX IF NOT EXISTS idx_topics_user ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_topics_user_enabled ON topics(user_id, enabled);

-- Papers indexes (with new fields)
CREATE UNIQUE INDEX IF NOT EXISTS idx_papers_arxiv_id ON papers(arxiv_id);
CREATE INDEX IF NOT EXISTS idx_papers_published ON papers(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_content_hash ON papers(content_hash);
CREATE INDEX IF NOT EXISTS idx_papers_collected_by ON papers(collected_for_user_id);

-- User-paper status indexes
CREATE INDEX IF NOT EXISTS idx_user_papers_user ON user_paper_status(user_id);
CREATE INDEX IF NOT EXISTS idx_user_papers_paper ON user_paper_status(paper_id);
CREATE INDEX IF NOT EXISTS idx_user_papers_explored ON user_paper_status(user_id, explored);
CREATE INDEX IF NOT EXISTS idx_user_papers_bookmarked ON user_paper_status(user_id, bookmarked);

-- Cost logs indexes
CREATE INDEX IF NOT EXISTS idx_cost_date ON cost_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_cost_user ON cost_logs(user_id, date);

-- =============================================================================
-- INITIAL DATA (Jeff and Wife)
-- =============================================================================

-- Insert initial users (using MCP API keys from .env)
INSERT OR IGNORE INTO users (username, email, api_key, display_name, is_active) VALUES
  ('jeff', 'jeffbarron@protonmail.com', 'c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d', 'Jeff', 1),
  ('wife', 'wife@example.com', 'e98699bedad9746e231843b96150c0638b7cceb717c44d5f9010a272a5b8de5b', 'Wife', 1);

-- Security-focused topics for Jeff (user_id = 1)
-- Tuned for offensive security researcher / pentester interests
INSERT OR IGNORE INTO topics (user_id, topic_name, arxiv_query, enabled) VALUES
  (1, 'Cybersecurity & CTF', 'cat:cs.CR AND (CTF OR capture the flag OR exploit OR vulnerability OR penetration OR red team)', 1),
  (1, 'AI Security Agents', 'cat:cs.CR AND (AI OR machine learning OR LLM OR agent OR automated)', 1),
  (1, 'Adversarial ML & Attacks', 'cat:cs.LG AND (adversarial OR attack OR evasion OR robust OR security)', 1),
  (1, 'LLM Security & Jailbreaks', 'cat:cs.CL AND (jailbreak OR prompt injection OR security OR adversarial OR attack)', 1),
  (1, 'Malware & Reverse Engineering', 'cat:cs.CR AND (malware OR reverse engineering OR binary OR obfuscation)', 1),
  (1, 'Network Security', 'cat:cs.CR AND (network OR intrusion OR detection OR traffic OR protocol)', 1);

-- Sample topics for Wife (user_id = 2)
-- Note: Customize these based on actual research interests
INSERT OR IGNORE INTO topics (user_id, topic_name, arxiv_query, enabled) VALUES
  (2, 'Computational Biology', 'cat:q-bio.QM AND (machine learning OR deep learning)', 1),
  (2, 'Healthcare AI', 'cat:cs.AI AND (medical OR healthcare OR diagnosis)', 1),
  (2, 'Genomics Research', 'cat:q-bio.GN AND (computational OR genomics)', 1);

-- =============================================================================
-- SCHEMA VERSION TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO schema_version (version) VALUES ('2.0');

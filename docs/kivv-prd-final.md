# kivv - arXiv Research Assistant - Cloudflare Workers MCP System
## Product Requirements Document v2.0

**Document Version:** 2.0
**Created:** 2025-11-29
**Updated:** 2025-11-30
**Author:** Principal Software Architect
**Status:** Production-Ready (Enhanced)

**Major Updates in v2.0:**
- Multi-user architecture (immediate support for 2+ users)
- Critical technical fixes from Codex review (rate limiting, error handling, scalability)
- Cost optimization strategy with two-stage triage
- Public/community deployment roadmap
- Updated implementation timeline and cost analysis

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Component Specifications](#3-component-specifications)
4. [Technology Stack Details](#4-technology-stack-details)
5. [Implementation Timeline](#5-implementation-timeline)
6. [Cost Analysis](#6-cost-analysis)
7. [Deployment & Operations](#7-deployment--operations)
8. [Future Enhancements](#8-future-enhancements)

---

## 1. Executive Summary

### 1.1 Project Overview

kivv (arXiv Research Assistant) is a fully-automated research paper discovery and summarization system designed for researchers who need to stay current with academic publications. The system automatically searches arXiv daily for papers matching configured topics, generates AI-powered summaries using intelligent cost optimization, and presents results through multiple interfaces including MCP protocol integration for AI assistants like Claude.

**Primary Use Case:** Daily automated collection and summarization of new arXiv papers on selected topics, accessible via MCP and unified viewing interfaces, with support for multiple users with independent topic configurations.

**Core Value Proposition:**
- Zero-friction daily research updates
- AI-powered paper summarization with intelligent cost optimization
- Multi-user support with independent topic configurations
- Seamless integration with Claude Desktop via MCP
- Cost-effective serverless architecture (mostly free tier)
- Single pane of glass for all discovered papers
- Production-ready with robust error handling and scalability

### 1.2 Success Metrics

**Technical Metrics:**
- Daily automation success rate: >99%
- MCP response time: <500ms (median) with KV caching
- Summary generation time: <15s per paper
- System uptime: >99.5%
- Cost per paper: <$0.01 (with two-stage triage)
- Rate limit compliance: 100% (no arXiv/Anthropic violations)
- Cron execution time: <10 minutes (within 15-min limit)

**User Metrics:**
- Time to discover relevant papers: <5 minutes daily
- Papers evaluated per session: 20-50
- False positive rate: <10%
- User session frequency: Daily
- Summary relevance score: >80%

**Multi-User Metrics:**
- Per-user topic isolation: 100%
- Per-user exploration tracking: Independent
- Shared paper visibility: Configurable

### 1.3 Architecture Decision Summary

After analyzing the requirements, reference implementations, Cloudflare Workers capabilities, and critical technical review feedback, the following architectural decisions were made:

#### **Decision 1: Hybrid Stack with TypeScript-First Approach**

**Selected:** TypeScript for all components (MCP server, automation workers, UI)

**Rationale:**
- Cloudflare Workers runtime is JavaScript/TypeScript native
- Modern PDF libraries (pdf-lib) sufficient for abstract extraction
- arXiv abstracts are comprehensive enough for quality summaries
- Eliminates need for separate Python service infrastructure
- Simpler deployment, lower latency, single technology stack
- Full type safety across entire system

**Trade-off:** We lose some Python PDF processing capabilities, but arXiv abstracts are typically 150-300 words and contain sufficient detail for meaningful summarization. For papers requiring full-text analysis, we store PDF URLs and can add Python processing later.

#### **Decision 2: Storage Architecture - D1 + R2 + KV with Multi-User Support**

**Selected:**
- **D1 (SQLite)** for paper metadata, topics, logs, **user accounts**
- **R2 (Object Storage)** for PDF files (optional caching)
- **KV (Key-Value Store)** for feed caching, session data, **rate limiting state**

**Rationale:**
- D1 provides relational queries, indexes, ACID transactions, and user isolation
- Free tier supports 5M reads/day (ample for multi-user use case)
- R2 has no egress fees (important for PDF access)
- KV provides fast caching for RSS feed generation and rate limit enforcement
- All three services integrate seamlessly with Workers

**Enhanced Data Flow (Multi-User):**
```
Daily Automation → Load User Topics → arXiv API → Rate Limiter (KV) 
                                                        ↓
                   D1 (metadata + users) ← Relevance Filter (Haiku)
                                                        ↓
                   Summary Generation (Sonnet) → D1 (update) → Per-User KV Cache
```

#### **Decision 3: Hybrid UI Strategy - RSS Primary + Per-User Feeds**

**Selected:** RSS/Atom feed as primary interface (per-user feeds), with optional Cloudflare Pages dashboard

**Rationale:**

**RSS/Atom Feed (Primary):**
- Zero additional UI development required
- Works with existing feed readers (Feedly, Inoreader, NetNewsWire)
- Mobile apps available on all platforms
- Standards-based, reliable, well-understood
- Can be generated in <50ms from D1 cache with KV acceleration
- Perfect for daily digest consumption pattern
- **Per-user feed URLs:** `/feed/{username}.xml` for independent subscriptions

**Cloudflare Pages Dashboard (Secondary - Optional):**
- For advanced features (mark as explored, search, filtering, user management)
- SvelteKit for modern, fast UI
- Deployed free on Cloudflare Pages
- Shares D1 database with MCP server
- OAuth login for multi-user access
- Can be added in Phase 2 without changing architecture

**Why not Notion?**
- Adds external dependency and API rate limits
- Costs $10/month for API access
- RSS readers provide equivalent functionality for consumption
- Can still export to Notion if users want (via separate tool)

#### **Decision 4: PDF Processing - Abstract-Only Strategy**

**Selected:** Use arXiv-provided abstracts for summarization, skip full PDF text extraction

**Rationale:**
- arXiv abstracts average 200-250 words (comprehensive)
- Structured by authors to convey key contributions
- Eliminates PDF parsing complexity in Workers
- Reduces processing time from ~30s to ~10s per paper
- 90% of researcher evaluation happens at abstract level
- Can add full-text processing later if needed

**Implementation:**
- Store PDF URL in D1 for user access
- Optionally cache PDF in R2 for faster retrieval
- Provide MCP tool to download/extract full text on-demand
- Future enhancement: Add Python service for full-text analysis

#### **Decision 5: Two-Stage AI Summarization with Cost Optimization**

**Selected:** Haiku for relevance triage, Sonnet for high-quality summaries (only for relevant papers)

**Rationale:**
- Haiku: $0.25 per 1M input tokens (10x cheaper than Sonnet)
- Filters out low-relevance papers before expensive summarization
- Expected 30-50% reduction in summarization costs
- Maintains high summary quality for relevant papers
- Configurable relevance threshold per user/topic

**Cost Comparison:**
- **Old approach:** 100 papers × $0.0024 = $0.24/day
- **New approach:** 100 papers × $0.00025 (Haiku) + 60 papers × $0.006 (Sonnet) = $0.025 + $0.36 = $0.385/day
- **With caching (50% hit rate):** ~$0.19/day (~21% savings)

### 1.4 GitHub Repository Structure

This project uses GitHub for version control with a monorepo structure containing all components.

**Repository:** `github.com/[your-username]/kivv`

**Structure:**
```
kivv/
├── mcp-server/           # MCP Worker (main component)
│   ├── src/
│   │   ├── index.ts
│   │   ├── tools/        # MCP tool implementations
│   │   ├── auth.ts       # API key authentication
│   │   ├── rate-limit.ts # Global rate limiter
│   │   └── users.ts      # Multi-user support
│   ├── test/
│   ├── wrangler.toml
│   └── package.json
├── automation/           # Daily automation worker
│   ├── src/
│   │   ├── index.ts
│   │   ├── arxiv-client.ts
│   │   ├── summarizer.ts      # Two-stage triage
│   │   ├── rate-limit.ts      # Token bucket implementation
│   │   └── checkpoint.ts      # Resumable automation
│   ├── wrangler.toml
│   └── package.json
├── dashboard/            # Optional SvelteKit dashboard
│   ├── src/
│   │   ├── routes/
│   │   │   ├── login/
│   │   │   ├── users/
│   │   │   └── admin/
│   │   └── lib/
│   ├── static/
│   └── package.json
├── shared/               # Shared types and utilities
│   ├── types.ts          # Common type definitions
│   ├── utils.ts
│   └── schema.sql        # Enhanced multi-user schema
├── .github/
│   └── workflows/
│       ├── deploy-mcp.yml
│       ├── deploy-automation.yml
│       └── test.yml
├── docs/
│   ├── setup.md
│   ├── api.md
│   ├── multi-user.md
│   ├── deployment.md
│   └── cost-optimization.md
├── README.md
├── .gitignore
└── package.json         # Root workspace config
```

**Git Workflow:**

During implementation, follow this commit workflow:
1. **Feature branches:** `feature/multi-user`, `feature/rate-limiting`, `feature/cost-optimization`
2. **Commit early and often:** Push after each completed sub-task
3. **Conventional commits:** Use `feat:`, `fix:`, `docs:`, `test:` prefixes
4. **CI/CD:** GitHub Actions automatically test and deploy on push to `main`

**Example commit flow:**
```bash
# Create feature branch
git checkout -b feature/multi-user-support

# Make changes, commit frequently
git add src/users.ts shared/schema.sql
git commit -m "feat(users): add multi-user schema and authentication"

# Push to GitHub
git push origin feature/multi-user-support

# Create PR when ready
# Merge to main triggers deployment
```


### 1.5 Technology Stack Summary

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **MCP Server** | TypeScript + Hono + @cloudflare/workers-mcp | Native Workers support, type-safe, fast routing |
| **Automation Worker** | TypeScript + Cloudflare Cron | Native scheduling, checkpointed execution for scalability |
| **Database** | D1 (SQLite) | Relational queries, multi-user support, free tier sufficient |
| **Object Storage** | R2 | PDF storage, no egress fees |
| **Cache Layer** | Workers KV | Feed caching, rate limiting state, session management |
| **AI Triage** | Claude 3.5 Haiku | Fast, cheap relevance scoring ($0.25/1M input tokens) |
| **AI Summarization** | Claude 3.5 Sonnet | Best quality for selected papers ($3/1M input tokens) |
| **Rate Limiting** | Token Bucket (KV) | Global rate limit enforcement for arXiv + Anthropic |
| **UI (Primary)** | RSS/Atom Feed | Zero dev effort, universal compatibility, per-user feeds |
| **UI (Secondary)** | SvelteKit + CF Pages | Modern, fast, free hosting, OAuth support |
| **Testing** | Vitest + Miniflare | Fast, Workers-compatible |
| **Deployment** | Wrangler CLI | Official Cloudflare deployment tool |

### 1.6 Why This Architecture is Optimal

**For the User:**
- Minimal setup (add RSS feed to reader, connect MCP to Claude)
- Daily automated updates (zero manual work)
- Fast summaries (Claude quality at scale with cost optimization)
- Multiple access methods (RSS, MCP, web dashboard)
- Works on all devices (desktop, mobile, AI assistant)
- **Independent user configurations** (each user manages own topics)

**For the System:**
- Serverless autoscaling (handles traffic spikes)
- Cost-effective (90% free tier eligible)
- Simple deployment (single `wrangler publish` command)
- Reliable infrastructure (Cloudflare's global network)
- Easy maintenance (TypeScript throughout, no polyglot complexity)
- **Production-ready:** Robust error handling, rate limiting, checkpointing

**For Future Growth:**
- Extensible architecture (easy to add Semantic Scholar, citations)
- Modular design (can add Python service for advanced PDF processing)
- **Multi-user ready:** Support for 2 users initially, scalable to thousands
- API-first (can add Discord bot, email digests, etc.)
- **Community features:** Topic sharing, public library, freemium model

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
+---------------------------------------------------------------------+
|                           USER INTERFACES                            |
|--------------+------------------+------------------+----------------┤
| Claude       | RSS Feed Reader  | Web Dashboard    | Mobile Apps    |
| Desktop      | (per-user feeds) | (OAuth login)    | (via RSS)      |
| (MCP)        | /feed/jeff.xml   | User management  |                |
'------+-------+--------+---------+--------+---------+--------+-------+
       |                |                  |                  |
       | MCP Protocol   | HTTP (RSS/Atom)  | HTTP (API)       |
       | + API key auth | + user auth      | + OAuth          |
       |                |                  |                  |
+------v----------------v------------------v------------------v-------+
|                    CLOUDFLARE WORKERS LAYER                          |
|----------------------+-----------------------------------------------┤
|  MCP Server Worker   |  Automation Worker (Cron)                     |
|  (/mcp endpoint)     |  (Daily at 06:00 UTC)                         |
|                      |                                                |
|  - User auth (API)   |  1. Load all users' topics from D1            |
|  - MCP Tools (8)     |  2. Query arXiv API (rate limited)            |
|  - Per-user filters  |  3. Filter duplicates (upsert logic)          |
|  - RSS/user feeds    |  4. Haiku relevance triage (cheap)            |
|  - Rate limit check  |  5. Sonnet summaries (expensive, selective)   |
|                      |  6. Checkpointed execution (resume on fail)   |
|                      |  7. Invalidate per-user KV caches             |
|                      |  8. Cost tracking & budget enforcement        |
'----------+-----------+-----------+-----------------------------------+
           |                       |
           | Worker Bindings       | Worker Bindings
           |                       |
+----------v-----------------------v-----------------------------------+
|                       STORAGE LAYER                                  |
|----------------+---------------------+-------------------------------┤
| D1 Database    | R2 Bucket           | KV Namespace                  |
| (SQLite)       | (Object Storage)    | (Key-Value)                   |
|                |                     |                               |
| Tables:        | Objects:            | Keys:                         |
| - users        | - PDFs (optional)   | - feed:{user}:rss             |
| - papers       | - abstracts (cache) | - rate:arxiv (token bucket)   |
| - topics       |                     | - rate:anthropic              |
| - user_papers  |                     | - checkpoint:{topic_id}       |
| - logs         |                     | - cost:{date} (daily spend)   |
'----------------+---------------------+-------------------------------+
                           |
                           | External API Calls (Rate Limited)
                           |
+--------------------------v-------------------------------------------+
|                      EXTERNAL SERVICES                               |
|---------------------+------------------------------------------------┤
| arXiv API           | Claude API (Anthropic)                         |
| (export.arxiv.org)  | (api.anthropic.com)                            |
|                     |                                                |
| - Paper search      | - Haiku: Relevance triage (~$0.00025/paper)   |
| - Metadata          | - Sonnet: Summarization (~$0.006/paper)       |
| - PDF URLs          | - Rate limit: 5 req/sec (enforced)            |
| - Rate: 1 req/3s    | - Budget: $1/day max (circuit breaker)        |
|   (enforced)        |                                                |
'---------------------+------------------------------------------------+
```

### 2.2 Data Flow Diagrams

#### 2.2.1 Enhanced Daily Automation Flow with Checkpointing

```
+---------------------------------------------------------------------+
| DAILY AUTOMATION WORKFLOW (Triggered at 06:00 UTC via Cron)        |
| WITH CHECKPOINTING & RATE LIMITING                                  |
'---------------------------------------------------------------------+

   +------------------+
   | Cron Trigger     |
   | (06:00 UTC)      |
   '--------+---------+
            |
            v
   +------------------------------------------------------+
   | Step 0: Load Checkpoints from KV                     |
   | - Check for incomplete runs from previous execution  |
   | - Resume from last successful topic if applicable    |
   | - Initialize rate limiter state                      |
   '--------+---------------------------------------------+
            |
            v
   +------------------------------------------------------+
   | Step 1: Load Active Topics from D1 (All Users)       |
   | SELECT t.*, u.id as user_id, u.username              |
   | FROM topics t JOIN users u ON t.user_id = u.id      |
   | WHERE t.enabled = 1                                  |
   | ORDER BY t.user_id, t.id                             |
   '--------+---------------------------------------------+
            |
            v
   +------------------------------------------------------+
   | Step 2: For Each Topic (Batched, Checkpointed)       |
   |                                                       |
   |  +------------------------------------------------+  |
   |  | Check Checkpoint: Already processed?            |  |
   |  | const done = await KV.get(`checkpoint:${id}`)  |  |
   |  | if (done) skip to next topic                   |  |
   |  '----------------+-------------------------------+  |
   |                   |                                   |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Rate Limit Check (Token Bucket)                |  |
   |  | await rateLimiter.acquire('arxiv', 1)          |  |
   |  | - Max: 1 req/3s for arXiv                      |  |
   |  | - Jitter: Add 100-300ms random delay           |  |
   |  '----------------+-------------------------------+  |
   |                   |                                   |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Query arXiv API                                |  |
   |  | - Use topic.arxiv_query                        |  |
   |  | - Filter: submittedDate >= yesterday           |  |
   |  | - Cursor: Use topic.last_cursor for batching   |  |
   |  | - Retry: 3 attempts with exponential backoff   |  |
   |  '----------------+-------------------------------+  |
   |                   |                                   |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Check for Duplicates (Upsert Logic)            |  |
   |  | INSERT INTO papers (arxiv_id, ...)             |  |
   |  | ON CONFLICT(arxiv_id) DO NOTHING               |  |
   |  | - Unique constraint enforced                   |  |
   |  '----------------+-------------------------------+  |
   |                   |                                   |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Store Checkpoint                               |  |
   |  | await KV.put(`checkpoint:${id}`, 'done',       |  |
   |  |              {expirationTtl: 86400})           |  |
   |  '------------------------------------------------+  |
   '-----------------┼-------------------------------------+
                     |
                     v
   +------------------------------------------------------+
   | Step 3: Two-Stage Summarization (Cost Optimized)     |
   |                                                       |
   |  For each new paper (batch of 20):                   |
   |  +------------------------------------------------+  |
   |  | Stage 1: Haiku Relevance Triage                |  |
   |  | - Input: title + abstract                      |  |
   |  | - Prompt: "Rate relevance 0.0-1.0"             |  |
   |  | - Cost: ~$0.00025/paper                        |  |
   |  | - Rate limit: await rateLimiter.acquire()      |  |
   |  '----------------+-------------------------------+  |
   |                   |                                   |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Relevance Filter: score >= threshold?          |  |
   |  | - Default threshold: 0.7                       |  |
   |  | - If NO: Mark as "low_priority", skip summary  |  |
   |  | - If YES: Proceed to Stage 2                   |  |
   |  '----------------+-------------------------------+  |
   |                   | (only ~60% of papers)             |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Stage 2: Sonnet Summarization                  |  |
   |  | - Input: title + abstract                      |  |
   |  | - max_output_tokens: 120 (strict limit)        |  |
   |  | - Prompt: Concise bullet format                |  |
   |  | - Cost: ~$0.006/paper                          |  |
   |  | - Rate limit: await rateLimiter.acquire()      |  |
   |  '----------------+-------------------------------+  |
   |                   |                                   |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Deduplication Check                            |  |
   |  | const hash = sha256(title + abstract)          |  |
   |  | SELECT summary FROM papers WHERE hash = ?      |  |
   |  | - If exists: Reuse cached summary              |  |
   |  | - Else: Store new summary + hash               |  |
   |  '----------------+-------------------------------+  |
   |                   |                                   |
   |                   v                                   |
   |  +------------------------------------------------+  |
   |  | Update Paper with Summary                      |  |
   |  | UPDATE papers SET summary = ?,                 |  |
   |  |   summary_generated_at = ?,                    |  |
   |  |   content_hash = ?,                            |  |
   |  |   relevance_score = ?                          |  |
   |  | WHERE id = ?                                   |  |
   |  '------------------------------------------------+  |
   |                                                       |
   |  +------------------------------------------------+  |
   |  | Budget Check (Circuit Breaker)                 |  |
   |  | const spent = await KV.get(`cost:${today}`)    |  |
   |  | if (spent > DAILY_CAP) {                       |  |
   |  |   log.error('Budget exceeded');                |  |
   |  |   sendAlert('80% budget used');                |  |
   |  |   break; // Stop processing                    |  |
   |  | }                                              |  |
   |  '------------------------------------------------+  |
   '-----------------┼-------------------------------------+
                     |
                     v
   +------------------------------------------------------+
   | Step 4: Post-Processing & Cleanup                    |
   | - Invalidate per-user KV caches (feed:*)             |
   | - Log results to collection_logs table               |
   | - Clear checkpoints (mark run complete)              |
   | - Track costs in cost_logs table                     |
   | - Send notification if errors OR budget alerts       |
   '------------------------------------------------------+
```


### 2.3 MCP Request Flow (Per-User)

```
+---------------------------------------------------------------------+
| MCP REQUEST WORKFLOW (User queries via Claude Desktop)             |
| WITH USER AUTHENTICATION                                            |
'---------------------------------------------------------------------+

   +------------------+
   | Claude Desktop   |
   | User: Jeff       |
   | API Key: key_123 |
   | Query: "Show me  |
   |  ML papers"      |
   '--------+---------+
            | MCP Protocol + API Key Header
            v
   +------------------------------------------------------+
   | MCP Server Worker: Authentication Middleware         |
   |                                                       |
   | const apiKey = request.headers.get('x-api-key');     |
   | const user = await db.prepare(                       |
   |   'SELECT * FROM users WHERE api_key = ?'            |
   | ).bind(apiKey).first();                              |
   |                                                       |
   | if (!user) return 401 Unauthorized;                  |
   '--------+---------------------------------------------+
            | Authenticated user context
            v
   +------------------------------------------------------+
   | Tool Handler: search_arxiv(user_id)                  |
   |                                                       |
   | Query D1 with User Filter:                           |
   |  +------------------------------------------------+  |
   |  | SELECT p.* FROM papers p                       |  |
   |  | JOIN user_paper_status ups                     |  |
   |  |   ON p.id = ups.paper_id                       |  |
   |  | WHERE ups.user_id = ?                          |  |
   |  |   AND (p.title LIKE ? OR p.abstract LIKE ?)    |  |
   |  | ORDER BY p.published_date DESC                 |  |
   |  | LIMIT ?                                        |  |
   |  '------------------------------------------------+  |
   |                                                       |
   | Include per-user metadata:                           |
   |  - ups.explored (this user's exploration status)     |
   |  - ups.bookmarked (this user's bookmarks)            |
   |  - ups.notes (this user's notes)                     |
   '--------+---------------------------------------------+
            |
            v
   +------------------------------------------------------+
   | Format Response (User-Specific)                      |
   |                                                       |
   | {                                                    |
   |   "user": "jeff",                                    |
   |   "papers": [                                        |
   |     {                                                |
   |       "arxiv_id": "2401.12345",                      |
   |       "title": "...",                                |
   |       "explored": true,  // Jeff's status            |
   |       "bookmarked": false,                           |
   |       "notes": "Interesting approach..."             |
   |     }                                                |
   |   ]                                                  |
   | }                                                    |
   '--------+---------------------------------------------+
            | MCP Protocol Response
            v
   +------------------+
   | Claude Desktop   |
   | Displays Jeff's  |
   | personalized     |
   | results          |
   '------------------+
```

### 2.4 Multi-User Architecture

#### 2.4.1 Immediate Need: Two Users (You + Wife)

**Current Requirement:**
- Two independent users with separate topic configurations
- Each user manages their own research topics
- Each user has independent "explored" status for papers
- Each user gets their own RSS feed
- Papers can be shared across users (visible to both)

**User Setup:**
```bash
# Create two users during initial deployment
wrangler d1 execute DB --command "
INSERT INTO users (username, email, api_key, created_at) VALUES
  ('jeff', 'jeff@example.com', 'key_jeff_abc123', CURRENT_TIMESTAMP),
  ('wife', 'wife@example.com', 'key_wife_xyz789', CURRENT_TIMESTAMP);
"

# Jeff's topics (AI Safety, LLMs)
wrangler d1 execute DB --command "
INSERT INTO topics (user_id, topic_name, arxiv_query, enabled) VALUES
  (1, 'AI Safety', 'cat:cs.AI AND (safety OR alignment)', 1),
  (1, 'Large Language Models', 'cat:cs.CL AND (transformer OR LLM OR GPT)', 1),
  (1, 'Reinforcement Learning', 'cat:cs.LG AND (reinforcement learning)', 1);
"

# Wife's topics (Biology ML, Healthcare AI)
wrangler d1 execute DB --command "
INSERT INTO topics (user_id, topic_name, arxiv_query, enabled) VALUES
  (2, 'Machine Learning in Biology', 'cat:q-bio.QM AND (machine learning OR deep learning)', 1),
  (2, 'Healthcare AI', 'cat:cs.AI AND (medical OR healthcare OR diagnosis)', 1),
  (2, 'Computational Genomics', 'cat:q-bio.GN AND (computational OR genomics)', 1);
"
```

#### 2.4.2 Enhanced D1 Schema for Multi-User Support

**New/Updated Tables:**

```sql
-- =============================================================================
-- MULTI-USER SUPPORT
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

-- Updated topics table with user ownership
-- (Add user_id column if migrating from v1.0)
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

-- Updated papers table with deduplication support
-- (Add columns if migrating from v1.0)
CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arxiv_id TEXT UNIQUE NOT NULL,         -- UNIQUE constraint added
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
-- INDEXES (Updated for Multi-User)
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
```

#### 2.4.3 User-Specific Features

**RSS Feed Per User:**
- URL format: `https://kivv.workers.dev/feed/{username}.xml`
- Example: `https://kivv.workers.dev/feed/jeff.xml`
- Each feed shows only papers from that user's topics
- Respects user's "explored" filter (can hide explored papers)
- KV cache key: `feed:{username}:rss`

**MCP Tools Per User:**
- All MCP tools accept user context (via API key authentication)
- `list_library` → Shows only user's papers (or shared papers)
- `manage_topics` → Operates on user's topics only
- `mark_explored` → Updates user_paper_status for that user
- `get_stats` → Shows user-specific statistics

**Paper Sharing:**
- Papers collected for User A are visible to User B (optional)
- Exploration status is per-user (independent tracking)
- Bookmarks and notes are per-user (private)

**Implementation Example:**

```typescript
// Authentication middleware
async function authenticateUser(request: Request, env: Env): Promise<User | null> {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) return null;
  
  const user = await env.DB
    .prepare('SELECT * FROM users WHERE api_key = ? AND is_active = 1')
    .bind(apiKey)
    .first();
  
  return user as User | null;
}

// User-filtered library query
async function listUserLibrary(userId: number, env: Env): Promise<Paper[]> {
  const results = await env.DB
    .prepare(`
      SELECT 
        p.*,
        ups.explored,
        ups.bookmarked,
        ups.notes
      FROM papers p
      LEFT JOIN user_paper_status ups 
        ON p.id = ups.paper_id AND ups.user_id = ?
      WHERE p.collected_for_user_id = ? 
         OR p.collected_for_user_id IS NULL  -- Shared papers
      ORDER BY p.published_date DESC
      LIMIT 50
    `)
    .bind(userId, userId)
    .all();
  
  return results.results as Paper[];
}

// Per-user RSS feed
async function generateUserFeed(username: string, env: Env): Promise<string> {
  // Check KV cache
  const cacheKey = `feed:${username}:rss`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) return cached;
  
  // Get user
  const user = await env.DB
    .prepare('SELECT id FROM users WHERE username = ?')
    .bind(username)
    .first();
  
  if (!user) throw new Error('User not found');
  
  // Get user's papers
  const papers = await listUserLibrary(user.id, env);
  
  // Generate RSS XML
  const rss = generateRSSXML(papers, username);
  
  // Cache for 5 minutes
  await env.CACHE.put(cacheKey, rss, { expirationTtl: 300 });
  
  return rss;
}
```

#### 2.4.4 Wife Onboarding Workflow

**Day 1: Account Creation (5 minutes)**
```bash
# Run during Week 2, Day 10-11 of implementation

# 1. Create wife's user account
wrangler d1 execute arxiv-papers --command "
INSERT INTO users (username, email, api_key, display_name) 
VALUES ('wife', 'wife@example.com', '$(openssl rand -hex 32)', 'Dr. [Wife Name]');
"

# 2. Get the generated API key
wrangler d1 execute arxiv-papers --command "
SELECT username, api_key FROM users WHERE username = 'wife';
"
# Save this API key for MCP configuration
```

**Day 2: Topic Configuration (10 minutes)**
```bash
# 3. Add wife's research topics
wrangler d1 execute arxiv-papers --command "
INSERT INTO topics (user_id, topic_name, arxiv_query, max_papers_per_day) VALUES
  (2, 'Machine Learning in Biology', 'cat:q-bio.QM AND (machine learning)', 25),
  (2, 'Healthcare AI', 'cat:cs.AI AND (medical OR healthcare)', 25),
  (2, 'Computational Genomics', 'cat:q-bio.GN', 15);
"

# 4. Verify topics created
wrangler d1 execute arxiv-papers --command "
SELECT t.topic_name, t.arxiv_query, u.username 
FROM topics t JOIN users u ON t.user_id = u.id 
WHERE u.username = 'wife';
"
```

**Day 3: MCP + RSS Setup (15 minutes)**

**Claude Desktop Configuration:**
```json
// ~/.config/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "kivv-wife": {
      "url": "https://kivv.workers.dev/mcp",
      "headers": {
        "x-api-key": "key_wife_xyz789_actual_key_here"
      },
      "description": "Wife's arXiv research assistant"
    }
  }
}
```

**RSS Feed Subscription:**
- URL: `https://kivv.workers.dev/feed/wife.xml`
- Add to Feedly/Inoreader/NetNewsWire
- Configure refresh interval: Every 6 hours

**Day 4: First Collection Run (Automated)**
- Cron runs at 06:00 UTC
- Collects papers for both users' topics
- Wife receives ~20-40 new papers in her feed
- Test MCP tools in Claude Desktop

**Ongoing: Independent Usage**
- Each user manages own topics via `manage_topics` MCP tool
- Each user sees own papers in RSS feed
- Each user's "explored" status is independent
- Each user's cost is tracked separately (optional budget per user)


---

## 3. Component Specifications

### 3.1 MCP Server Worker (TypeScript)

#### 3.1.1 Worker Configuration with Enhanced Security

**File:** `wrangler.toml`

```toml
name = "kivv-mcp-server"
main = "src/index.ts"
compatibility_date = "2024-11-29"

[env.production]
route = "https://kivv.workers.dev/mcp"

[[d1_databases]]
binding = "DB"
database_name = "arxiv-papers"
database_id = "your-database-id"

[[r2_buckets]]
binding = "PDFS"
bucket_name = "arxiv-pdfs"

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"

[vars]
ENVIRONMENT = "production"
FEED_CACHE_TTL = "300"
MAX_PAPERS_PER_FEED = "50"
MCP_RESPONSE_TIMEOUT_MS = "500"
MAX_TOPICS_PER_USER = "20"
MAX_QUERY_LENGTH = "500"

# Secrets (set via: wrangler secret put SECRET_NAME)
# - ANTHROPIC_API_KEY
# - ADMIN_API_KEY (for user management)
# - SENTRY_DSN (optional, for error tracking)
```

#### 3.1.2 Caching Strategy for <500ms Response Time

**Problem:** D1 queries can take 100-300ms without caching, making <500ms target difficult.

**Solution:** Multi-layer caching with KV

```typescript
// Cache layer implementation
interface CacheStrategy {
  key: string;
  ttl: number;  // seconds
  layer: 'kv' | 'memory';
}

const CACHE_STRATEGIES: Record<string, CacheStrategy> = {
  feed: { key: 'feed:{user}:{format}', ttl: 300, layer: 'kv' },
  library_list: { key: 'library:{user}:list', ttl: 60, layer: 'kv' },
  user_topics: { key: 'topics:{user}', ttl: 120, layer: 'kv' },
  paper_detail: { key: 'paper:{arxiv_id}', ttl: 300, layer: 'kv' },
  stats: { key: 'stats:{user}', ttl: 60, layer: 'kv' }
};

async function getCached<T>(
  strategy: CacheStrategy,
  userId: string,
  fetcher: () => Promise<T>,
  env: Env
): Promise<T> {
  const cacheKey = strategy.key.replace('{user}', userId);
  
  // Check KV cache
  const cached = await env.CACHE.get(cacheKey, 'json');
  if (cached) {
    console.log(`[Cache HIT] ${cacheKey}`);
    return cached as T;
  }
  
  console.log(`[Cache MISS] ${cacheKey}`);
  
  // Fetch fresh data
  const data = await fetcher();
  
  // Store in KV
  await env.CACHE.put(cacheKey, JSON.stringify(data), {
    expirationTtl: strategy.ttl
  });
  
  return data;
}

// Usage example
async function listLibrary(userId: number, env: Env): Promise<Paper[]> {
  return getCached(
    CACHE_STRATEGIES.library_list,
    String(userId),
    async () => {
      // Expensive D1 query
      const result = await env.DB.prepare(`
        SELECT p.*, ups.explored, ups.bookmarked
        FROM papers p
        LEFT JOIN user_paper_status ups ON p.id = ups.paper_id
        WHERE ups.user_id = ?
        ORDER BY p.published_date DESC
        LIMIT 50
      `).bind(userId).all();
      
      return result.results as Paper[];
    },
    env
  );
}
```

**Performance Targets:**
- Cache hit: <50ms (KV latency)
- Cache miss: <300ms (D1 query + cache write)
- Precomputed feed cache: <20ms (KV-only read)


### 3.2 Daily Automation Worker with Checkpointing

#### 3.2.1 Scalability Solution: Batched Processing with Checkpoints

**Problem:** 100 papers × 15s each = 1,500s (25 minutes) exceeds 15-min Worker limit

**Solution:** Checkpointed, resumable automation with batching

```typescript
// Checkpoint management
interface Checkpoint {
  topicId: number;
  userId: number;
  cursor: string | null;
  papersProcessed: number;
  lastProcessedId: string | null;
  timestamp: string;
}

async function saveCheckpoint(
  topicId: number,
  checkpoint: Checkpoint,
  env: Env
): Promise<void> {
  const key = `checkpoint:topic:${topicId}`;
  await env.CACHE.put(key, JSON.stringify(checkpoint), {
    expirationTtl: 86400  // 24 hours
  });
}

async function loadCheckpoint(
  topicId: number,
  env: Env
): Promise<Checkpoint | null> {
  const key = `checkpoint:topic:${topicId}`;
  const data = await env.CACHE.get(key, 'json');
  return data as Checkpoint | null;
}

async function clearCheckpoint(topicId: number, env: Env): Promise<void> {
  await env.CACHE.delete(`checkpoint:topic:${topicId}`);
}

// Batched processing workflow
async function processBatchedTopics(
  env: Env,
  startTime: number,
  maxDuration: number = 13 * 60 * 1000  // 13 minutes (留有2分钟buffer)
): Promise<void> {
  const topics = await loadActiveTopics(env);
  
  for (const topic of topics) {
    // Check if we're approaching time limit
    const elapsed = Date.now() - startTime;
    if (elapsed > maxDuration) {
      console.log(`[Automation] Time limit approaching, stopping at topic ${topic.id}`);
      break;
    }
    
    // Load checkpoint for this topic
    const checkpoint = await loadCheckpoint(topic.id, env);
    const startCursor = checkpoint?.cursor || null;
    
    try {
      // Process papers for this topic (batched, max 50 per topic)
      const result = await processTopicPapers(
        topic,
        startCursor,
        env
      );
      
      if (result.hasMore) {
        // Save checkpoint to resume in next run
        await saveCheckpoint(topic.id, {
          topicId: topic.id,
          userId: topic.user_id,
          cursor: result.nextCursor,
          papersProcessed: result.processedCount,
          lastProcessedId: result.lastPaperId,
          timestamp: new Date().toISOString()
        }, env);
        
        console.log(`[Automation] Topic ${topic.id} has more papers, checkpoint saved`);
      } else {
        // Topic complete, clear checkpoint
        await clearCheckpoint(topic.id, env);
        console.log(`[Automation] Topic ${topic.id} complete`);
      }
      
    } catch (error) {
      console.error(`[Automation] Error processing topic ${topic.id}:`, error);
      // Keep checkpoint to retry in next run
      continue;
    }
  }
}

// Process papers for a single topic with batching
async function processTopicPapers(
  topic: Topic,
  startCursor: string | null,
  env: Env
): Promise<{
  processedCount: number;
  hasMore: boolean;
  nextCursor: string | null;
  lastPaperId: string | null;
}> {
  const batchSize = topic.max_papers_per_day || 50;
  
  // Query arXiv with cursor support
  const papers = await queryArxivWithCursor(
    topic.arxiv_query,
    startCursor,
    batchSize,
    env
  );
  
  if (papers.length === 0) {
    return {
      processedCount: 0,
      hasMore: false,
      nextCursor: null,
      lastPaperId: null
    };
  }
  
  // Store new papers (upsert logic handles duplicates)
  await upsertPapers(papers, topic.user_id, env);
  
  // Two-stage summarization
  await processSummaries(papers, topic, env);
  
  return {
    processedCount: papers.length,
    hasMore: papers.length >= batchSize,
    nextCursor: papers[papers.length - 1].arxiv_id,
    lastPaperId: papers[papers.length - 1].arxiv_id
  };
}
```

#### 3.2.2 Upsert Logic for Deduplication

**Problem:** No unique constraint on arxiv_id causes duplicates

**Solution:** UNIQUE constraint + ON CONFLICT DO NOTHING

```typescript
async function upsertPapers(
  papers: ArxivPaper[],
  userId: number,
  env: Env
): Promise<void> {
  // Batch upsert with conflict handling
  const statements = papers.map(paper => {
    const hash = computeContentHash(paper.title, paper.abstract);
    
    return env.DB.prepare(`
      INSERT INTO papers (
        arxiv_id, title, authors, abstract, categories,
        published_date, pdf_url, content_hash, collected_for_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(arxiv_id) DO UPDATE SET
        -- Update metadata if changed
        title = excluded.title,
        abstract = excluded.abstract,
        categories = excluded.categories
    `).bind(
      paper.arxivId,
      paper.title,
      JSON.stringify(paper.authors),
      paper.abstract,
      JSON.stringify(paper.categories),
      paper.publishedDate,
      paper.pdfUrl,
      hash,
      userId
    );
  });
  
  await env.DB.batch(statements);
  console.log(`[Database] Upserted ${papers.length} papers for user ${userId}`);
}

function computeContentHash(title: string, abstract: string): string {
  const content = title.trim() + '\n' + abstract.trim();
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
    .then(hash => Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    );
}
```

#### 3.2.3 Comprehensive Error Handling & Retry Logic

**Problem:** Thin retry logic, no catch-up for failed runs

**Solution:** Exponential backoff, idempotent markers, partial failure recovery

```typescript
// Enhanced retry with exponential backoff and jitter
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitter?: boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    jitter = true
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (isNonRetryableError(error)) {
        throw error;
      }
      
      if (attempt < maxRetries - 1) {
        // Exponential backoff: 1s, 2s, 4s, 8s, ...
        let delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        
        // Add jitter: randomize ±25% to prevent thundering herd
        if (jitter) {
          const jitterAmount = delay * 0.25;
          delay = delay + (Math.random() * 2 - 1) * jitterAmount;
        }
        
        console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms`, error);
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

function isNonRetryableError(error: any): boolean {
  // Don't retry on 4xx client errors (except 429 rate limit)
  if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
    return true;
  }
  
  // Don't retry on validation errors
  if (error.name === 'ValidationError') {
    return true;
  }
  
  return false;
}

// Idempotent operation markers
interface IdempotencyMarker {
  operationId: string;
  status: 'pending' | 'success' | 'failed';
  result?: any;
  error?: string;
  timestamp: string;
}

async function withIdempotency<T>(
  operationId: string,
  fn: () => Promise<T>,
  env: Env,
  ttl: number = 3600
): Promise<T> {
  const key = `idempotency:${operationId}`;
  
  // Check if operation already completed
  const existing = await env.CACHE.get(key, 'json') as IdempotencyMarker | null;
  
  if (existing) {
    if (existing.status === 'success') {
      console.log(`[Idempotency] Operation ${operationId} already completed`);
      return existing.result as T;
    }
    
    if (existing.status === 'failed') {
      console.log(`[Idempotency] Operation ${operationId} previously failed, retrying`);
      // Continue to retry
    }
  }
  
  // Mark as pending
  await env.CACHE.put(key, JSON.stringify({
    operationId,
    status: 'pending',
    timestamp: new Date().toISOString()
  } as IdempotencyMarker), { expirationTtl: ttl });
  
  try {
    const result = await fn();
    
    // Mark as success
    await env.CACHE.put(key, JSON.stringify({
      operationId,
      status: 'success',
      result,
      timestamp: new Date().toISOString()
    } as IdempotencyMarker), { expirationTtl: ttl });
    
    return result;
  } catch (error) {
    // Mark as failed
    await env.CACHE.put(key, JSON.stringify({
      operationId,
      status: 'failed',
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    } as IdempotencyMarker), { expirationTtl: ttl });
    
    throw error;
  }
}

// Partial failure recovery
async function processWithPartialFailureRecovery(
  items: any[],
  processor: (item: any) => Promise<void>,
  options: {
    continueOnError?: boolean;
    maxFailures?: number;
  } = {}
): Promise<{ successCount: number; failedCount: number; errors: Error[] }> {
  const {
    continueOnError = true,
    maxFailures = Infinity
  } = options;
  
  let successCount = 0;
  let failedCount = 0;
  const errors: Error[] = [];
  
  for (const item of items) {
    try {
      await processor(item);
      successCount++;
    } catch (error) {
      failedCount++;
      errors.push(error as Error);
      
      console.error(`[PartialFailure] Item processing failed:`, error);
      
      if (!continueOnError || failedCount >= maxFailures) {
        throw new Error(`Partial failure recovery stopped: ${failedCount} failures`);
      }
    }
  }
  
  return { successCount, failedCount, errors };
}

// Usage example
async function summarizeNewPapers(papers: ArxivPaper[], env: Env): Promise<void> {
  const result = await processWithPartialFailureRecovery(
    papers,
    async (paper) => {
      await withRetry(
        () => summarizePaper(paper, env),
        { maxRetries: 3, jitter: true }
      );
    },
    { continueOnError: true, maxFailures: 10 }
  );
  
  console.log(`[Summary] ${result.successCount} succeeded, ${result.failedCount} failed`);
  
  if (result.failedCount > 0) {
    // Log failures for manual review
    await logFailedSummaries(result.errors, env);
  }
}
```


### 3.3 Rate Limiting Architecture (NEW SECTION)

#### 3.3.1 Global Rate Limiter with Token Bucket

**Problem:** No global rate limit enforcement for arXiv (1 req/3s) or Anthropic API

**Solution:** Token bucket algorithm with KV-backed state and jitter

```typescript
// Token bucket rate limiter
interface TokenBucket {
  tokens: number;
  capacity: number;
  refillRate: number;  // tokens per second
  lastRefill: number;  // timestamp
}

interface RateLimitConfig {
  arxiv: { capacity: 1, refillRate: 1/3 };      // 1 request per 3 seconds
  anthropic: { capacity: 5, refillRate: 5 };    // 5 requests per second
  anthropic_haiku: { capacity: 10, refillRate: 10 };  // 10 requests per second (cheaper model)
}

class RateLimiter {
  constructor(private env: Env) {}
  
  async acquire(service: keyof RateLimitConfig, tokens: number = 1): Promise<void> {
    const config = RATE_LIMIT_CONFIG[service];
    const key = `rate:${service}`;
    
    while (true) {
      // Load current bucket state from KV
      const bucketData = await this.env.CACHE.get(key, 'json') as TokenBucket | null;
      
      const now = Date.now();
      let bucket: TokenBucket;
      
      if (!bucketData) {
        // Initialize new bucket
        bucket = {
          tokens: config.capacity,
          capacity: config.capacity,
          refillRate: config.refillRate,
          lastRefill: now
        };
      } else {
        bucket = bucketData;
        
        // Refill tokens based on time elapsed
        const elapsedSeconds = (now - bucket.lastRefill) / 1000;
        const tokensToAdd = elapsedSeconds * bucket.refillRate;
        bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
      }
      
      // Check if we have enough tokens
      if (bucket.tokens >= tokens) {
        // Consume tokens
        bucket.tokens -= tokens;
        
        // Save updated bucket
        await this.env.CACHE.put(key, JSON.stringify(bucket), {
          expirationTtl: 3600  // 1 hour TTL
        });
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 100;  // 0-100ms
        await sleep(jitter);
        
        console.log(`[RateLimit] ${service}: Acquired ${tokens} tokens, ${bucket.tokens.toFixed(2)} remaining`);
        return;
      }
      
      // Not enough tokens, calculate wait time
      const tokensNeeded = tokens - bucket.tokens;
      const waitMs = (tokensNeeded / bucket.refillRate) * 1000;
      
      console.log(`[RateLimit] ${service}: Waiting ${waitMs.toFixed(0)}ms for tokens`);
      await sleep(waitMs + 100);  // Add 100ms buffer
    }
  }
  
  // Check if tokens are available without consuming
  async check(service: keyof RateLimitConfig, tokens: number = 1): Promise<boolean> {
    const config = RATE_LIMIT_CONFIG[service];
    const key = `rate:${service}`;
    
    const bucketData = await this.env.CACHE.get(key, 'json') as TokenBucket | null;
    if (!bucketData) return true;
    
    const now = Date.now();
    const elapsedSeconds = (now - bucketData.lastRefill) / 1000;
    const currentTokens = Math.min(
      bucketData.capacity,
      bucketData.tokens + (elapsedSeconds * bucketData.refillRate)
    );
    
    return currentTokens >= tokens;
  }
}

const RATE_LIMIT_CONFIG: RateLimitConfig = {
  arxiv: { capacity: 1, refillRate: 1/3 },
  anthropic: { capacity: 5, refillRate: 5 },
  anthropic_haiku: { capacity: 10, refillRate: 10 }
};

// Usage in automation worker
async function collectPapersWithRateLimit(
  topic: Topic,
  env: Env
): Promise<ArxivPaper[]> {
  const rateLimiter = new RateLimiter(env);
  
  // Wait for rate limit token before making arXiv request
  await rateLimiter.acquire('arxiv');
  
  const papers = await queryArxivAPI(topic.arxiv_query, env);
  return papers;
}

async function summarizePaperWithRateLimit(
  paper: ArxivPaper,
  model: 'haiku' | 'sonnet',
  env: Env
): Promise<string> {
  const rateLimiter = new RateLimiter(env);
  
  // Different rate limits for different models
  const service = model === 'haiku' ? 'anthropic_haiku' : 'anthropic';
  await rateLimiter.acquire(service);
  
  const summary = await callClaudeAPI(paper, model, env);
  return summary;
}
```

#### 3.3.2 Rate Limit Monitoring & Alerts

```typescript
// Track rate limit violations
interface RateLimitViolation {
  service: string;
  timestamp: string;
  waitTimeMs: number;
  severity: 'warning' | 'error';
}

async function trackRateLimitViolation(
  violation: RateLimitViolation,
  env: Env
): Promise<void> {
  // Log to D1
  await env.DB.prepare(`
    INSERT INTO rate_limit_logs (service, timestamp, wait_time_ms, severity)
    VALUES (?, ?, ?, ?)
  `).bind(
    violation.service,
    violation.timestamp,
    violation.waitTimeMs,
    violation.severity
  ).run();
  
  // If severe (>10s wait), send alert
  if (violation.waitTimeMs > 10000) {
    await sendAlert({
      title: 'Rate Limit Violation',
      message: `${violation.service} exceeded rate limit, waited ${violation.waitTimeMs}ms`,
      severity: violation.severity
    }, env);
  }
}

// Monitor rate limit health
async function checkRateLimitHealth(env: Env): Promise<{
  healthy: boolean;
  services: Record<string, { tokensAvailable: number; utilizationPercent: number }>;
}> {
  const rateLimiter = new RateLimiter(env);
  const services = ['arxiv', 'anthropic', 'anthropic_haiku'] as const;
  
  const health: Record<string, any> = {};
  let allHealthy = true;
  
  for (const service of services) {
    const config = RATE_LIMIT_CONFIG[service];
    const key = `rate:${service}`;
    const bucket = await env.CACHE.get(key, 'json') as TokenBucket | null;
    
    if (!bucket) {
      health[service] = {
        tokensAvailable: config.capacity,
        utilizationPercent: 0
      };
      continue;
    }
    
    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    const currentTokens = Math.min(
      bucket.capacity,
      bucket.tokens + (elapsedSeconds * bucket.refillRate)
    );
    
    const utilization = ((bucket.capacity - currentTokens) / bucket.capacity) * 100;
    
    health[service] = {
      tokensAvailable: currentTokens,
      utilizationPercent: utilization
    };
    
    // Mark as unhealthy if utilization > 90%
    if (utilization > 90) {
      allHealthy = false;
    }
  }
  
  return { healthy: allHealthy, services: health };
}
```

### 3.4 Cost Optimization with Two-Stage Triage (NEW SECTION)

#### 3.4.1 Haiku Relevance Triage + Sonnet Summarization

**Strategy:** Use cheap Haiku model to filter out low-relevance papers before expensive Sonnet summarization

```typescript
// Two-stage summarization pipeline
interface TriageResult {
  relevant: boolean;
  relevanceScore: number;
  reasoning: string;
}

interface SummaryResult {
  summary: string;
  model: string;
  tokensUsed: { input: number; output: number };
  cost: number;
}

async function twoStageSummarization(
  paper: ArxivPaper,
  topic: Topic,
  env: Env
): Promise<SummaryResult | null> {
  const rateLimiter = new RateLimiter(env);
  
  // ========== STAGE 1: Haiku Relevance Triage ==========
  await rateLimiter.acquire('anthropic_haiku');
  
  const triagePrompt = `Rate the relevance of this arXiv paper to the research topic "${topic.topic_name}".

Paper Title: ${paper.title}
Abstract: ${paper.abstract}

Respond with ONLY a JSON object in this exact format:
{
  "score": <number between 0.0 and 1.0>,
  "reasoning": "<brief explanation>"
}`;

  const triageResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: triagePrompt
      }]
    })
  });
  
  const triageData = await triageResponse.json();
  const triageResult: TriageResult = JSON.parse(triageData.content[0].text);
  
  // Calculate triage cost (Haiku: $0.25/1M input, $1.25/1M output)
  const triageInputTokens = triageData.usage.input_tokens;
  const triageOutputTokens = triageData.usage.output_tokens;
  const triageCost = (triageInputTokens * 0.25 + triageOutputTokens * 1.25) / 1_000_000;
  
  // Log triage
  console.log(`[Triage] ${paper.arxivId}: Score ${triageResult.score.toFixed(2)}, Cost $${triageCost.toFixed(6)}`);
  
  // Track cost
  await trackCost('haiku', triageInputTokens, triageOutputTokens, triageCost, env);
  
  // Check relevance threshold
  const threshold = topic.relevance_threshold || 0.7;
  if (triageResult.relevanceScore < threshold) {
    console.log(`[Triage] ${paper.arxivId}: Below threshold (${threshold}), skipping summary`);
    
    // Store low-relevance marker
    await env.DB.prepare(`
      UPDATE papers
      SET relevance_score = ?, summary = 'LOW_RELEVANCE'
      WHERE arxiv_id = ?
    `).bind(triageResult.relevanceScore, paper.arxivId).run();
    
    return null;
  }
  
  // ========== STAGE 2: Sonnet Summarization ==========
  await rateLimiter.acquire('anthropic');
  
  const summaryPrompt = `Summarize this arXiv paper in exactly 3 bullet points. Be concise and technical.

Title: ${paper.title}
Abstract: ${paper.abstract}

Format:
• [Problem/Context]
• [Method/Approach]
• [Results/Impact]`;

  const summaryResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 120,  // STRICT LIMIT
      messages: [{
        role: 'user',
        content: summaryPrompt
      }]
    })
  });
  
  const summaryData = await summaryResponse.json();
  const summary = summaryData.content[0].text;
  
  // Calculate summary cost (Sonnet: $3/1M input, $15/1M output)
  const summaryInputTokens = summaryData.usage.input_tokens;
  const summaryOutputTokens = summaryData.usage.output_tokens;
  const summaryCost = (summaryInputTokens * 3 + summaryOutputTokens * 15) / 1_000_000;
  
  console.log(`[Summary] ${paper.arxivId}: Cost $${summaryCost.toFixed(6)}`);
  
  // Track cost
  await trackCost('sonnet', summaryInputTokens, summaryOutputTokens, summaryCost, env);
  
  // Store summary with metadata
  const contentHash = await computeContentHash(paper.title, paper.abstract);
  await env.DB.prepare(`
    UPDATE papers
    SET 
      summary = ?,
      summary_generated_at = CURRENT_TIMESTAMP,
      summary_model = ?,
      relevance_score = ?,
      content_hash = ?
    WHERE arxiv_id = ?
  `).bind(
    summary,
    'claude-3-5-sonnet-20241022',
    triageResult.relevanceScore,
    contentHash,
    paper.arxivId
  ).run();
  
  return {
    summary,
    model: 'claude-3-5-sonnet-20241022',
    tokensUsed: {
      input: summaryInputTokens,
      output: summaryOutputTokens
    },
    cost: triageCost + summaryCost
  };
}

// Cost tracking
async function trackCost(
  model: 'haiku' | 'sonnet',
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  env: Env
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // Log to D1
  await env.DB.prepare(`
    INSERT INTO cost_logs (date, service, papers_processed, tokens_input, tokens_output, cost_usd)
    VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(date, service) DO UPDATE SET
      papers_processed = papers_processed + 1,
      tokens_input = tokens_input + excluded.tokens_input,
      tokens_output = tokens_output + excluded.tokens_output,
      cost_usd = cost_usd + excluded.cost_usd
  `).bind(today, model, inputTokens, outputTokens, costUsd).run();
  
  // Update daily total in KV (for fast access)
  const key = `cost:${today}`;
  const current = await env.CACHE.get(key, 'json') as { total: number } | null;
  const newTotal = (current?.total || 0) + costUsd;
  
  await env.CACHE.put(key, JSON.stringify({ total: newTotal }), {
    expirationTtl: 86400 * 7  // 7 days
  });
}
```

#### 3.4.2 Budget Guardrails & Circuit Breaker

```typescript
// Budget enforcement
interface BudgetConfig {
  dailyCap: number;      // $1.00 per day
  monthlyCap: number;    // $30.00 per month
  alertThresholds: number[];  // [0.5, 0.8] = 50%, 80%
}

const BUDGET_CONFIG: BudgetConfig = {
  dailyCap: 1.00,
  monthlyCap: 30.00,
  alertThresholds: [0.5, 0.8]
};

async function checkBudget(env: Env): Promise<{ allowed: boolean; reason?: string }> {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);  // YYYY-MM
  
  // Check daily budget
  const dailyKey = `cost:${today}`;
  const dailySpent = await env.CACHE.get(dailyKey, 'json') as { total: number } | null;
  const dailyTotal = dailySpent?.total || 0;
  
  if (dailyTotal >= BUDGET_CONFIG.dailyCap) {
    console.error(`[Budget] Daily cap exceeded: $${dailyTotal.toFixed(2)} >= $${BUDGET_CONFIG.dailyCap}`);
    await sendAlert({
      title: 'Daily Budget Exceeded',
      message: `Spent $${dailyTotal.toFixed(2)} today, cap is $${BUDGET_CONFIG.dailyCap}`,
      severity: 'error'
    }, env);
    return { allowed: false, reason: 'daily_cap_exceeded' };
  }
  
  // Check monthly budget
  const monthlyResult = await env.DB.prepare(`
    SELECT SUM(cost_usd) as total
    FROM cost_logs
    WHERE date LIKE ?
  `).bind(`${thisMonth}%`).first();
  
  const monthlyTotal = (monthlyResult?.total as number) || 0;
  
  if (monthlyTotal >= BUDGET_CONFIG.monthlyCap) {
    console.error(`[Budget] Monthly cap exceeded: $${monthlyTotal.toFixed(2)} >= $${BUDGET_CONFIG.monthlyCap}`);
    await sendAlert({
      title: 'Monthly Budget Exceeded',
      message: `Spent $${monthlyTotal.toFixed(2)} this month, cap is $${BUDGET_CONFIG.monthlyCap}`,
      severity: 'error'
    }, env);
    return { allowed: false, reason: 'monthly_cap_exceeded' };
  }
  
  // Check alert thresholds
  for (const threshold of BUDGET_CONFIG.alertThresholds) {
    const dailyThreshold = BUDGET_CONFIG.dailyCap * threshold;
    const monthlyThreshold = BUDGET_CONFIG.monthlyCap * threshold;
    
    if (dailyTotal >= dailyThreshold && dailyTotal < dailyThreshold + 0.01) {
      await sendAlert({
        title: `Daily Budget ${(threshold * 100)}% Used`,
        message: `Spent $${dailyTotal.toFixed(2)} of $${BUDGET_CONFIG.dailyCap} today`,
        severity: 'warning'
      }, env);
    }
    
    if (monthlyTotal >= monthlyThreshold && monthlyTotal < monthlyThreshold + 0.10) {
      await sendAlert({
        title: `Monthly Budget ${(threshold * 100)}% Used`,
        message: `Spent $${monthlyTotal.toFixed(2)} of $${BUDGET_CONFIG.monthlyCap} this month`,
        severity: 'warning'
      }, env);
    }
  }
  
  return { allowed: true };
}

// Use in automation workflow
async function processSummariesWithBudgetCheck(
  papers: ArxivPaper[],
  topic: Topic,
  env: Env
): Promise<void> {
  for (const paper of papers) {
    // Check budget before each summary
    const budgetCheck = await checkBudget(env);
    if (!budgetCheck.allowed) {
      console.error(`[Budget] Stopping summarization: ${budgetCheck.reason}`);
      break;
    }
    
    await twoStageSummarization(paper, topic, env);
  }
}
```

#### 3.4.3 Caching by Content Hash

**Problem:** Same paper summarized multiple times across topics

**Solution:** Reuse summaries based on content hash

```typescript
async function getSummaryWithCache(
  paper: ArxivPaper,
  topic: Topic,
  env: Env
): Promise<string | null> {
  const contentHash = await computeContentHash(paper.title, paper.abstract);
  
  // Check if we already have a summary for this content
  const existing = await env.DB.prepare(`
    SELECT summary, summary_model, relevance_score
    FROM papers
    WHERE content_hash = ? AND summary IS NOT NULL AND summary != 'LOW_RELEVANCE'
    LIMIT 1
  `).bind(contentHash).first();
  
  if (existing) {
    console.log(`[Cache] Reusing summary for ${paper.arxivId} (hash: ${contentHash.substring(0, 8)}...)`);
    
    // Copy summary to current paper
    await env.DB.prepare(`
      UPDATE papers
      SET 
        summary = ?,
        summary_model = ?,
        relevance_score = ?,
        summary_generated_at = CURRENT_TIMESTAMP
      WHERE arxiv_id = ?
    `).bind(
      existing.summary,
      existing.summary_model,
      existing.relevance_score,
      paper.arxivId
    ).run();
    
    return existing.summary as string;
  }
  
  // No cached summary, generate new one
  const result = await twoStageSummarization(paper, topic, env);
  return result?.summary || null;
}
```


### 3.5 Observability, Logging & Monitoring (ENHANCED SECTION)

#### 3.5.1 Structured Logging

```typescript
// Structured logging system
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  metadata?: Record<string, any>;
  userId?: number;
  paperId?: string;
  topicId?: number;
}

class Logger {
  constructor(private service: string, private env: Env) {}
  
  private async log(level: LogLevel, message: string, metadata?: Record<string, any>): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      metadata
    };
    
    // Console log for development
    console.log(JSON.stringify(entry));
    
    // Store critical logs in D1
    if (level === LogLevel.ERROR || level === LogLevel.WARN) {
      await this.env.DB.prepare(`
        INSERT INTO system_logs (timestamp, level, service, message, metadata)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        entry.timestamp,
        entry.level,
        entry.service,
        entry.message,
        JSON.stringify(entry.metadata || {})
      ).run();
    }
  }
  
  debug(message: string, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.DEBUG, message, metadata);
  }
  
  info(message: string, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.INFO, message, metadata);
  }
  
  warn(message: string, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.WARN, message, metadata);
  }
  
  error(message: string, error?: Error, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.ERROR, message, {
      ...metadata,
      error: error?.message,
      stack: error?.stack
    });
  }
}

// Usage
const logger = new Logger('automation-worker', env);
await logger.info('Starting daily collection', { topicsCount: topics.length });
await logger.error('Failed to collect papers', error, { topicId: topic.id });
```

#### 3.5.2 Cost Tracking Dashboard Query

```typescript
// Get cost summary for dashboard
async function getCostSummary(env: Env): Promise<{
  today: { haiku: number; sonnet: number; total: number };
  thisMonth: { haiku: number; sonnet: number; total: number };
  avgPerPaper: number;
  projectedMonthly: number;
}> {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);
  
  // Today's costs
  const todayResult = await env.DB.prepare(`
    SELECT service, SUM(cost_usd) as cost, SUM(papers_processed) as papers
    FROM cost_logs
    WHERE date = ?
    GROUP BY service
  `).bind(today).all();
  
  // This month's costs
  const monthResult = await env.DB.prepare(`
    SELECT service, SUM(cost_usd) as cost, SUM(papers_processed) as papers
    FROM cost_logs
    WHERE date LIKE ?
    GROUP BY service
  `).bind(`${thisMonth}%`).all();
  
  const todayCosts = {
    haiku: 0,
    sonnet: 0,
    total: 0
  };
  
  const monthCosts = {
    haiku: 0,
    sonnet: 0,
    total: 0
  };
  
  for (const row of todayResult.results) {
    const service = row.service as string;
    const cost = row.cost as number;
    todayCosts[service] = cost;
    todayCosts.total += cost;
  }
  
  let totalPapers = 0;
  for (const row of monthResult.results) {
    const service = row.service as string;
    const cost = row.cost as number;
    const papers = row.papers as number;
    monthCosts[service] = cost;
    monthCosts.total += cost;
    totalPapers += papers;
  }
  
  const avgPerPaper = totalPapers > 0 ? monthCosts.total / totalPapers : 0;
  
  // Project monthly cost based on current daily average
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const daysElapsed = new Date().getDate();
  const projectedMonthly = daysElapsed > 0 ? (monthCosts.total / daysElapsed) * daysInMonth : 0;
  
  return {
    today: todayCosts,
    thisMonth: monthCosts,
    avgPerPaper,
    projectedMonthly
  };
}
```

#### 3.5.3 Alert System

```typescript
interface Alert {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  metadata?: Record<string, any>;
}

async function sendAlert(alert: Alert, env: Env): Promise<void> {
  // Log alert
  const logger = new Logger('alerts', env);
  await logger.warn(`ALERT: ${alert.title}`, {
    message: alert.message,
    severity: alert.severity,
    ...alert.metadata
  });
  
  // Send to webhook (e.g., Slack, Discord, email)
  if (env.ALERT_WEBHOOK_URL) {
    try {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🚨 ${alert.title}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${alert.title}*\n${alert.message}\n\nSeverity: \`${alert.severity}\``
              }
            }
          ]
        })
      });
    } catch (error) {
      console.error('[Alert] Failed to send webhook:', error);
    }
  }
}
```

### 3.6 Security & Access Control (NEW SECTION)

#### 3.6.1 API Key Authentication

```typescript
// Per-user API key authentication for MCP
async function authenticateRequest(request: Request, env: Env): Promise<User | null> {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return null;
  }
  
  // Validate API key format (prevent injection)
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(apiKey)) {
    return null;
  }
  
  // Lookup user in D1
  const user = await env.DB.prepare(`
    SELECT id, username, email, is_active
    FROM users
    WHERE api_key = ? AND is_active = 1
    LIMIT 1
  `).bind(apiKey).first();
  
  if (!user) {
    return null;
  }
  
  // Update last_login timestamp
  await env.DB.prepare(`
    UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
  `).bind(user.id).run();
  
  return user as User;
}

// Middleware wrapper
async function withAuth(
  request: Request,
  env: Env,
  handler: (user: User, request: Request, env: Env) => Promise<Response>
): Promise<Response> {
  const user = await authenticateRequest(request, env);
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return handler(user, request, env);
}
```

#### 3.6.2 Per-User Quotas & Input Validation

```typescript
// Input validation
function validateTopicInput(input: {
  topicName?: string;
  arxivQuery?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (input.topicName) {
    // Max 100 characters
    if (input.topicName.length > 100) {
      errors.push('Topic name must be 100 characters or less');
    }
    
    // No special characters that could cause issues
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(input.topicName)) {
      errors.push('Topic name contains invalid characters');
    }
  }
  
  if (input.arxivQuery) {
    // Max 500 characters to prevent unbounded queries
    if (input.arxivQuery.length > 500) {
      errors.push('arXiv query must be 500 characters or less');
    }
    
    // Basic SQL injection prevention
    if (/(\bDROP\b|\bDELETE\b|\bUPDATE\b)/i.test(input.arxivQuery)) {
      errors.push('arXiv query contains forbidden keywords');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Per-user quota enforcement
async function checkUserQuota(userId: number, env: Env): Promise<{ allowed: boolean; reason?: string }> {
  // Check topic count
  const topicCount = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM topics WHERE user_id = ?
  `).bind(userId).first();
  
  if ((topicCount?.count as number) >= MAX_TOPICS_PER_USER) {
    return {
      allowed: false,
      reason: `Maximum ${MAX_TOPICS_PER_USER} topics per user`
    };
  }
  
  // Check daily paper collection (prevent abuse)
  const today = new Date().toISOString().split('T')[0];
  const todayPapers = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM papers
    WHERE collected_for_user_id = ?
      AND DATE(created_at) = ?
  `).bind(userId, today).first();
  
  const MAX_PAPERS_PER_DAY_PER_USER = 200;
  if ((todayPapers?.count as number) >= MAX_PAPERS_PER_DAY_PER_USER) {
    return {
      allowed: false,
      reason: `Maximum ${MAX_PAPERS_PER_DAY_PER_USER} papers per day`
    };
  }
  
  return { allowed: true };
}

// Use in topic creation
async function createTopic(
  user: User,
  topicName: string,
  arxivQuery: string,
  env: Env
): Promise<Topic> {
  // Validate input
  const validation = validateTopicInput({ topicName, arxivQuery });
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  
  // Check quota
  const quota = await checkUserQuota(user.id, env);
  if (!quota.allowed) {
    throw new Error(quota.reason);
  }
  
  // Create topic
  const result = await env.DB.prepare(`
    INSERT INTO topics (user_id, topic_name, arxiv_query, enabled)
    VALUES (?, ?, ?, 1)
    RETURNING *
  `).bind(user.id, topicName, arxivQuery).first();
  
  return result as Topic;
}
```


---

## 5. Implementation Timeline (UPDATED)

### 5.1 Updated Three-Week Plan with Multi-User & Hardening

#### **Week 1: Foundation + Multi-User Support (Days 1-7)**

**Day 1-2: Infrastructure + Multi-User Schema**
- [ ] Initialize GitHub repository (` git init`, create repo on GitHub)
- [ ] Set up monorepo structure (mcp-server/, automation/, shared/)
- [ ] **Git:** Initial commit with project structure
- [ ] Create Cloudflare account, install Wrangler CLI
- [ ] Initialize project structure (TypeScript, Hono, tests)
- [ ] Create D1 database with **multi-user schema** (users, topics.user_id, user_paper_status)
- [ ] **Git:** Commit database migration scripts (`git commit -m "feat(db): add multi-user schema"`)
- [ ] Create R2 bucket, KV namespace
- [ ] Configure wrangler.toml with bindings
- [ ] Set up GitHub Actions workflows
- [ ] **Git:** Commit infrastructure config
- [ ] **Deliverable:** Working local dev environment with multi-user database

**Day 3-4: Core MCP Server + Authentication**
- [ ] Create feature branch (`git checkout -b feature/mcp-core-auth`)
- [ ] Implement **user authentication middleware** (API key validation)
- [ ] **Git:** Commit auth middleware
- [ ] Implement MCP protocol handler (tools/list, tools/call, resources/*)
- [ ] **Git:** Commit MCP handler
- [ ] Implement first 3 MCP tools **with user context**:
  - `search_arxiv` (user-filtered)
  - `get_paper` (user-specific metadata)
  - `list_library` (user-filtered)
- [ ] **Git:** Commit tools
- [ ] Implement **KV caching strategy** for <500ms response time
- [ ] Write unit tests for auth + tools
- [ ] **Git:** Commit tests and push
- [ ] **Deliverable:** MCP server with user auth working

**Day 5-7: Daily Automation + Rate Limiting**
- [ ] Create feature branch (`git checkout -b feature/automation-ratelimit`)
- [ ] Implement **token bucket rate limiter** (KV-backed)
- [ ] **Git:** Commit rate limiter
- [ ] Implement arXiv API client **with rate limiting**
- [ ] **Git:** Commit API client
- [ ] Implement **checkpointed automation workflow**:
  - Load all users' topics
  - Batched processing (50 papers/topic max)
  - Resume from checkpoint on failure
  - Upsert logic with UNIQUE constraint
- [ ] **Git:** Commit automation workflow
- [ ] Implement cron trigger, logging to `collection_logs`
- [ ] **Git:** Commit cron setup
- [ ] Test with 2 sample users (you + test user)
- [ ] Push and merge to main
- [ ] **Deliverable:** Automated daily paper collection with rate limiting

#### **Week 2: Cost Optimization + Wife Onboarding (Days 8-14)**

**Day 8-9: Two-Stage AI Summarization**
- [ ] Create feature branch (`git checkout -b feature/cost-optimization`)
- [ ] Implement **Haiku relevance triage** (Stage 1)
- [ ] **Git:** Commit Haiku triage
- [ ] Implement **Sonnet summarization** (Stage 2, selective)
- [ ] **Git:** Commit Sonnet summarization
- [ ] Implement **content hash caching** (avoid re-summarizing same content)
- [ ] Implement **budget guardrails** (daily/monthly caps, circuit breaker)
- [ ] **Git:** Commit budget system
- [ ] Add `summarize_paper` MCP tool
- [ ] Add cost tracking to automation workflow
- [ ] **Git:** Commit workflow updates
- [ ] Test with different relevance thresholds
- [ ] Push and merge to main
- [ ] **Deliverable:** Cost-optimized AI summarization working

**Day 10-11: Wife Onboarding + Remaining MCP Tools**
- [ ] **Create wife's user account:**
  ```bash
  wrangler d1 execute DB --command "INSERT INTO users ..."
  ```
- [ ] **Configure wife's topics** (Biology ML, Healthcare AI, Genomics)
- [ ] **Test wife's MCP access** (API key in Claude Desktop)
- [ ] **Test wife's RSS feed** (`/feed/wife.xml`)
- [ ] Implement remaining MCP tools:
  - `manage_topics` (per-user CRUD)
  - `mark_explored` (user-specific status)
  - `get_stats` (per-user statistics)
  - `get_feed` (per-user feeds)
- [ ] **Git:** Commit tools
- [ ] Write tests for all tools
- [ ] **Git:** Commit tests and push
- [ ] **Deliverable:** All 8 MCP tools functional, wife onboarded

**Day 12-14: RSS Feeds + Testing**
- [ ] Create feature branch (`git checkout -b feature/rss-feeds`)
- [ ] Implement **per-user RSS/Atom feed** generation
- [ ] Add KV caching for feeds (5-min TTL)
- [ ] **Git:** Commit RSS implementation
- [ ] Test feeds in multiple readers (Feedly, NetNewsWire)
- [ ] Run **integration tests** (MCP + automation + feeds)
- [ ] Load test with simulated 100 papers/day
- [ ] **Git:** Push and merge to main
- [ ] **Deliverable:** Per-user RSS feeds working, system tested

#### **Week 3: Hardening + Production Deployment (Days 15-21)**

**Day 15-16: Error Handling + Observability**
- [ ] Implement **comprehensive error handling** (exponential backoff, partial failure recovery)
- [ ] Implement **structured logging** system
- [ ] Implement **cost tracking dashboard** queries
- [ ] Implement **alert system** (budget, errors, rate limits)
- [ ] Add **security hardening** (input validation, quota enforcement)
- [ ] **Git:** Commit hardening features
- [ ] Fix bugs discovered during testing
- [ ] **Deliverable:** Production-hardened system

**Day 17-18: Documentation**
- [ ] Write README with setup instructions
- [ ] Document all MCP tools (input/output schemas)
- [ ] Create **multi-user setup guide**
- [ ] Create **wife onboarding guide**
- [ ] Document rate limiting and cost optimization
- [ ] Create admin guide for topic management
- [ ] **Git:** Commit documentation
- [ ] **Deliverable:** Complete documentation

**Day 19-21: Production Deployment**
- [ ] Review all code, ensure tests pass
- [ ] **Git:** Create release branch (`git checkout -b release/v2.0`)
- [ ] Deploy MCP server to production (merge to main triggers GitHub Actions)
- [ ] Deploy automation worker
- [ ] Configure production secrets in Cloudflare (API keys)
- [ ] Set up monitoring (Cloudflare Analytics + custom dashboards)
- [ ] Test end-to-end:
  - Jeff's MCP → D1 → RSS
  - Wife's MCP → D1 → RSS
  - Automation → Both users
  - Budget enforcement
  - Rate limiting
- [ ] Run first production automation (collect papers for both users)
- [ ] **Git:** Tag release (`git tag -a v2.0.0 -m "Release v2.0.0 - Multi-user support"`)
- [ ] **Git:** Push tags (`git push origin v2.0.0`)
- [ ] **Deliverable:** Production system live with 2 users

### 5.2 Minimal Viable Product (MVP) - Updated

**Week 1 MVP (7 days):**
- MCP server with 4 basic tools (search, get, list, topics)
- **Multi-user support (2 users: you + wife)**
- **User authentication (API key)**
- **Rate limiting (arXiv + Anthropic)**
- Daily automation with checkpointing
- RSS feed generation (per-user)
- D1 storage with multi-user schema

**Week 2 Enhancements:**
- **Two-stage AI summarization (Haiku + Sonnet)**
- **Budget guardrails (daily/monthly caps)**
- **Cost tracking and alerts**
- All 8 MCP tools
- Enhanced error handling

**Week 3 Production Readiness:**
- Comprehensive observability
- Security hardening
- Complete documentation
- Production deployment

**What's excluded from initial release:**
- Web dashboard (add in Month 2)
- R2 PDF caching (optional)
- Advanced filtering/search
- Public/community features (see roadmap below)


---

## 6. Cost Analysis (UPDATED FOR MULTI-USER)

### 6.1 Cloudflare Costs (No Change)

#### **Workers Free Tier:**
- 100,000 requests per day
- 10ms CPU time per request
- No bandwidth charges

**Estimated Usage (2 users):**
- MCP requests: ~200/day (2 users × 100)
- RSS feed requests: ~100/day (2 users × 50)
- Automation runs: 1/day
- **Total:** ~301 requests/day
- **Cost:** **$0/month** (well within free tier)

#### **D1 Database Free Tier:**
- 5 GB storage
- 5,000,000 rows read per day
- 100,000 rows written per day

**Estimated Usage (2 users):**
- Storage: ~200 MB (20,000 papers × 10 KB each)
- Reads: ~2,000/day (MCP queries, feed generation)
- Writes: ~100/day (new papers for both users)
- **Cost:** **$0/month** (well within free tier)

#### **R2 + KV:** Same as v1.0, **$0/month** (free tier sufficient)

### 6.2 Claude API Costs with Two-Stage Optimization (NEW)

**Pricing:**
- **Haiku:** Input $0.25/1M tokens, Output $1.25/1M tokens
- **Sonnet:** Input $3/1M tokens, Output $15/1M tokens

#### **Cost Breakdown Per Paper (Two-Stage):**

**Stage 1: Haiku Triage (100% of papers)**
- Input: ~300 tokens (title + abstract)
- Output: ~50 tokens (relevance score + reasoning)
- Cost: (300 × 0.25 + 50 × 1.25) / 1,000,000 = **$0.00014**

**Stage 2: Sonnet Summary (Only ~60% of papers)**
- Input: ~300 tokens
- Output: ~100 tokens (strict 120 token limit)
- Cost: (300 × 3 + 100 × 15) / 1,000,000 = **$0.0024**

**Total Per Paper (Average):**
- Triage all papers: $0.00014
- Summarize 60%: $0.0024 × 0.6 = $0.00144
- **Average cost: $0.00158** (~34% savings vs. direct Sonnet)

**With 50% Cache Hit Rate:**
- New papers: $0.00158
- Cached papers: $0.00014 (triage only)
- **Average: $0.00086** (~64% savings)

#### **Monthly Cost Scenarios (Multi-User):**

**Scenario 1: Two Users (You + Wife) - 30-50 papers/day**

| Metric | Value |
|--------|-------|
| Papers/day | 40 |
| New papers (50% cache hit) | 20 |
| Cached papers | 20 |
| Haiku triage cost | 40 × $0.00014 = $0.0056/day |
| Sonnet summary cost (60% of new) | 12 × $0.0024 = $0.029/day |
| **Daily total** | **$0.035/day** |
| **Monthly total** | **$1.05/month** |

**Scenario 2: 10 Beta Users - 150-250 papers/day**

| Metric | Value |
|--------|-------|
| Papers/day | 200 |
| New papers (50% cache hit) | 100 |
| Cached papers | 100 |
| Haiku cost | 200 × $0.00014 = $0.028/day |
| Sonnet cost (60% of new) | 60 × $0.0024 = $0.144/day |
| **Daily total** | **$0.172/day** |
| **Monthly total** | **$5.16/month** |

**Scenario 3: 100 Free Users (Heavy Caching) - 1000-1500 papers/day**

| Metric | Value |
|--------|-------|
| Papers/day | 1200 |
| New papers (80% cache hit due to overlap) | 240 |
| Cached papers | 960 |
| Haiku cost | 1200 × $0.00014 = $0.168/day |
| Sonnet cost (60% of new) | 144 × $0.0024 = $0.346/day |
| **Daily total** | **$0.514/day** |
| **Monthly total** | **$15.42/month** |

**Scenario 4: 50 Paid + 500 Free Users**

| Metric | Value |
|--------|-------|
| Papers/day | 5000 |
| New papers (85% cache hit) | 750 |
| Cached papers | 4250 |
| Haiku cost | 5000 × $0.00014 = $0.70/day |
| Sonnet cost (60% of new) | 450 × $0.0024 = $1.08/day |
| **Daily total** | **$1.78/day** |
| **Monthly total** | **$53.40/month** |
| **Revenue (paid users)** | 50 × $5 = **$250/month** |
| **Net profit** | **$196.60/month** |

### 6.3 Cost Optimization Impact Summary

**Old Approach (Direct Sonnet, No Caching):**
- 40 papers/day × $0.0024 = $0.096/day = **$2.88/month**

**New Approach (Two-Stage + Caching):**
- Two users: **$1.05/month** (~64% savings)
- With budget cap: **$1.00/day max** = **$30/month cap**

**Key Savings Mechanisms:**
1. **Haiku triage:** 10x cheaper, filters ~40% of papers
2. **Content hash caching:** Reuse summaries across topics/users
3. **Strict token limits:** max_output_tokens=120 enforced
4. **Budget circuit breaker:** Stops processing at $1/day

### 6.4 Total Monthly Operating Cost

**Baseline Scenario (2 users: You + Wife):**

| Service | Cost |
|---------|------|
| Cloudflare Workers | $0 |
| D1 Database | $0 |
| R2 Storage | $0 |
| KV Namespace | $0 |
| Claude API (40 papers/day, optimized) | $1.05 |
| **Total** | **$1.05/month** |

**Cost per paper:** $0.00086 (~86% reduction from $0.0024)

---

## 7. Deployment & Operations

### 7.1 Setup Steps (Same as v1.0 with Multi-User Additions)

[Previous setup steps remain the same]

#### **Step 3.5: Create Initial Users**

```bash
# After D1 database is created and schema applied

# Generate secure API keys
JEFF_KEY=$(openssl rand -hex 32)
WIFE_KEY=$(openssl rand -hex 32)

# Create users
wrangler d1 execute arxiv-papers --command "
INSERT INTO users (username, email, api_key, display_name, is_active) VALUES
  ('jeff', 'jeff@example.com', '${JEFF_KEY}', 'Jeff', 1),
  ('wife', 'wife@example.com', '${WIFE_KEY}', 'Dr. Wife', 1);
"

# Display API keys (save these securely!)
echo "Jeff's API key: ${JEFF_KEY}"
echo "Wife's API key: ${WIFE_KEY}"

# Add to Claude Desktop config
echo "Add these to ~/.config/Claude/claude_desktop_config.json:"
cat <<EOF
{
  "mcpServers": {
    "kivv-jeff": {
      "url": "https://kivv.workers.dev/mcp",
      "headers": {
        "x-api-key": "${JEFF_KEY}"
      }
    },
    "kivv-wife": {
      "url": "https://kivv.workers.dev/mcp",
      "headers": {
        "x-api-key": "${WIFE_KEY}"
      }
    }
  }
}
EOF
```

### 7.2 Monitoring & Alerting (ENHANCED)

#### **Cloudflare Analytics Dashboard:**
- Workers requests/errors
- D1 read/write operations
- KV hit/miss rates
- CPU time usage

#### **Custom Metrics (D1 Queries):**

```sql
-- Daily automation success rate
SELECT 
  DATE(run_date) as date,
  COUNT(*) as total_runs,
  SUM(CASE WHEN papers_failed < 0 THEN 1 ELSE 0 END) as failed_runs,
  (1.0 - SUM(CASE WHEN papers_failed < 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) * 100 as success_rate
FROM collection_logs
WHERE run_date >= DATE('now', '-30 days')
GROUP BY DATE(run_date)
ORDER BY date DESC;

-- Cost tracking
SELECT 
  date,
  SUM(CASE WHEN service = 'haiku' THEN cost_usd ELSE 0 END) as haiku_cost,
  SUM(CASE WHEN service = 'sonnet' THEN cost_usd ELSE 0 END) as sonnet_cost,
  SUM(cost_usd) as total_cost,
  SUM(papers_processed) as papers
FROM cost_logs
WHERE date >= DATE('now', '-30 days')
GROUP BY date
ORDER BY date DESC;

-- Per-user statistics
SELECT 
  u.username,
  COUNT(DISTINCT t.id) as topics,
  COUNT(DISTINCT p.id) as papers_collected,
  SUM(CASE WHEN ups.explored = 1 THEN 1 ELSE 0 END) as papers_explored,
  SUM(CASE WHEN ups.bookmarked = 1 THEN 1 ELSE 0 END) as papers_bookmarked
FROM users u
LEFT JOIN topics t ON u.id = t.user_id
LEFT JOIN papers p ON p.collected_for_user_id = u.id
LEFT JOIN user_paper_status ups ON u.id = ups.user_id AND p.id = ups.paper_id
GROUP BY u.id, u.username;

-- Rate limit health
SELECT 
  service,
  COUNT(*) as violations,
  AVG(wait_time_ms) as avg_wait_ms,
  MAX(wait_time_ms) as max_wait_ms
FROM rate_limit_logs
WHERE timestamp >= DATETIME('now', '-24 hours')
GROUP BY service;
```

#### **Alert Triggers:**
- Budget ≥ 50% of daily cap → Warning
- Budget ≥ 80% of daily cap → Critical
- Budget ≥ 100% of daily cap → Circuit breaker activated
- Automation run failed → Error
- Rate limit exceeded → Warning
- Error rate > 5% → Warning
- MCP response time > 1s → Warning

### 7.3 Backup & Recovery

**D1 Backup Strategy:**
```bash
# Daily backup script
wrangler d1 export arxiv-papers --output=backup-$(date +%Y%m%d).sql

# Upload to R2 for long-term storage
wrangler r2 object put arxiv-backups/backup-$(date +%Y%m%d).sql --file=backup-$(date +%Y%m%d).sql
```

**Recovery:**
```bash
# Restore from backup
wrangler d1 execute arxiv-papers --file=backup-20241201.sql
```

**KV State Recovery:**
- Rate limiter state: Regenerates automatically (token bucket refills)
- Feed caches: Regenerate on next request (5-min TTL)
- Checkpoints: Safe to lose (automation resumes from beginning)
- Cost tracking: Backed up in D1 `cost_logs` table


---

## 8. Future Enhancements

### 8.1 Post-MVP Enhancements (Month 1-2)

[Previous enhancements from v1.0 remain valid]

### 8.2 Public/Community Deployment Roadmap (NEW SECTION)

#### **Phase 1: Internal (Current) - Week 1-3**

**Target:** 2 users (you + wife)

**Features:**
- Manual user creation via wrangler CLI
- Hardcoded API keys
- Private deployment
- No OAuth, no signup flow
- Direct D1 user management

**Infrastructure:**
- Cloudflare Workers (free tier)
- D1 database (free tier)
- No dashboard required

**Cost:** ~$1/month

---

#### **Phase 2: Invite-Only Beta - Month 2 (Weeks 4-8)**

**Target:** 10-20 beta users (friends, colleagues, researchers)

**New Features:**
- **Simple signup form** (Cloudflare Pages)
  - Name, email, research interests
  - Auto-generate API key
  - Email confirmation (SendGrid/Resend)
- **User dashboard** (SvelteKit + Cloudflare Pages)
  - Topic management (CRUD via UI)
  - Paper browsing/search
  - Cost usage per user (optional)
  - Settings (relevance threshold, max papers/day)
- **OAuth login** (GitHub, Google via Cloudflare Access)
- **Cost limits per user**
  - Free tier: 5 topics, 25 papers/day, summaries only for relevant papers
  - Daily cap per user: $0.10/day (prevents abuse)
- **Admin panel**
  - User management
  - System health monitoring
  - Cost tracking

**Infrastructure Changes:**
- Add Cloudflare Pages for dashboard
- Add email service (SendGrid free tier: 100 emails/day)
- Add user roles (admin, beta_user, user)

**Implementation Tasks:**
```typescript
// Signup flow
async function handleSignup(email: string, name: string, env: Env): Promise<void> {
  // Generate API key
  const apiKey = crypto.randomUUID().replace(/-/g, '');
  
  // Create user (pending email verification)
  await env.DB.prepare(`
    INSERT INTO users (email, username, api_key, display_name, is_active)
    VALUES (?, ?, ?, ?, 0)
  `).bind(email, email.split('@')[0], apiKey, name).run();
  
  // Send verification email
  const verificationToken = crypto.randomUUID();
  await sendVerificationEmail(email, verificationToken, env);
  
  // Store verification token in KV (24h expiry)
  await env.CACHE.put(`verify:${verificationToken}`, email, {
    expirationTtl: 86400
  });
}

// Email verification
async function verifyEmail(token: string, env: Env): Promise<boolean> {
  const email = await env.CACHE.get(`verify:${token}`);
  if (!email) return false;
  
  // Activate user
  await env.DB.prepare(`
    UPDATE users SET is_active = 1 WHERE email = ?
  `).bind(email).run();
  
  await env.CACHE.delete(`verify:${token}`);
  return true;
}
```

**Cost Estimate:**
- Cloudflare: $0 (free tier sufficient)
- Claude API: ~$5-15/month (10-20 users × 25 papers/day)
- Email: $0 (SendGrid free tier)
- **Total: $5-15/month**

---

#### **Phase 3: Public Launch - Month 3-4 (Weeks 9-16)**

**Target:** Open signups, freemium model

**Freemium Model:**

| Feature | Free Tier | Paid Tier ($5/month) |
|---------|-----------|----------------------|
| Topics | 5 | Unlimited |
| Papers/day | 25 | 100 |
| Summaries | Cached only (reuse existing) | Priority + new summaries |
| RSS feed | Yes | Yes |
| MCP access | Yes | Yes |
| Web dashboard | Basic | Advanced (search, filters, export) |
| Support | Community | Email support |
| API access | Read-only | Full CRUD |

**New Features:**
- **Payment processing** (Stripe integration)
  - Subscription management
  - Automatic billing
  - Trial period (14 days)
- **Usage quotas** enforced by Cloudflare Durable Objects
  - Rate limiting per user tier
  - Graceful degradation for free users
- **Public MCP server** (same endpoint, tier-based quotas)
- **Topic templates** (e.g., "Top AI Papers", "Latest in Quantum")
- **Paper export** (to Zotero, Notion, Obsidian)

**Infrastructure Changes:**
- Upgrade D1 to paid plan if >5GB
- Cloudflare Durable Objects for quota enforcement
- Stripe integration for payments
- CDN for static assets

**Implementation - Quota Enforcement:**
```typescript
// Durable Object for per-user quota tracking
export class UserQuota {
  state: DurableObjectState;
  env: Env;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  
  async checkQuota(userId: number, quotaType: 'papers' | 'summaries'): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    const key = `quota:${userId}:${quotaType}:${today}`;
    
    // Get user tier
    const user = await this.env.DB.prepare(`
      SELECT tier FROM users WHERE id = ?
    `).bind(userId).first();
    
    const limits = {
      free: { papers: 25, summaries: 0 },
      paid: { papers: 100, summaries: 100 }
    };
    
    const limit = limits[user.tier][quotaType];
    const current = (await this.state.storage.get(key)) || 0;
    
    if (current >= limit) {
      return false;
    }
    
    // Increment quota
    await this.state.storage.put(key, current + 1);
    return true;
  }
}
```

**Revenue Projections:**

| Users | Free | Paid | Revenue | Costs | Net |
|-------|------|------|---------|-------|-----|
| 100 | 90 | 10 | $50/mo | $20/mo | $30/mo |
| 500 | 450 | 50 | $250/mo | $100/mo | $150/mo |
| 1000 | 900 | 100 | $500/mo | $200/mo | $300/mo |
| 5000 | 4500 | 500 | $2,500/mo | $800/mo | $1,700/mo |

**Break-even:** ~50 paid users ($250/mo revenue vs. ~$100/mo cost)

---

#### **Phase 4: Community Features - Month 5+ (Weeks 17+)**

**Target:** Community-driven research platform

**Community Features:**
- **Topic sharing**
  - Users can publish topics as "public templates"
  - Browse popular topics (e.g., "Top AI Papers", "Quantum ML")
  - Fork/copy topics from community
  - Upvote/downvote topics
- **Public topic library**
  - Curated collections by research area
  - Trending papers across all users
  - Most bookmarked papers
- **Reading groups**
  - Shared paper lists
  - Collaborative annotations (via web dashboard)
  - Discussion threads per paper
  - Group RSS feeds
- **Paper recommendations**
  - ML-based recommendations based on user's reading history
  - "Users who read this also read..."
  - Collaborative filtering
- **Integrations**
  - Zotero export (BibTeX)
  - Notion sync (API)
  - Obsidian plugin
  - Slack/Discord bot
  - Email digests (weekly summary)
- **Browser extension**
  - Direct arXiv.org integration
  - "Add to kivv" button on arXiv
  - Inline summaries on arXiv
- **Mobile apps**
  - React Native (iOS + Android)
  - Offline reading
  - Push notifications for new papers

**Advanced Features:**
- **Citation network**
  - Track paper citations
  - Visualize citation graphs
  - Find related papers via citations
- **Author following**
  - Subscribe to specific authors
  - Get notified of new papers
- **Semantic search**
  - Embedding-based paper search (OpenAI/Anthropic embeddings)
  - "Find papers similar to this"
- **Full-text analysis** (optional)
  - Python service for PDF parsing
  - Extract figures, tables, code
  - Summarize entire paper (not just abstract)

**Infrastructure Scaling:**

| Users | D1 Size | R2 Storage | Workers Req/day | Monthly Cost |
|-------|---------|------------|-----------------|--------------|
| 1,000 | 2 GB | 5 GB | 100k | Free tier |
| 5,000 | 8 GB | 25 GB | 500k | ~$50 |
| 10,000 | 15 GB | 50 GB | 1M | ~$150 |
| 50,000 | 75 GB | 250 GB | 5M | ~$800 |

**Revenue at Scale:**

| Paid Users | Monthly Revenue | Costs | Net Profit |
|------------|-----------------|-------|------------|
| 500 | $2,500 | $100 | $2,400 |
| 1,000 | $5,000 | $200 | $4,800 |
| 5,000 | $25,000 | $800 | $24,200 |
| 10,000 | $50,000 | $1,500 | $48,500 |

**Key Milestones:**
- **Month 2:** Beta launch (10-20 users)
- **Month 3:** Public launch (100+ users)
- **Month 6:** 500 users, $150/mo profit
- **Month 12:** 1,000 users, $4,800/mo profit, consider team expansion
- **Month 24:** 5,000+ users, $24k/mo profit, full-time sustainable

---

### 8.3 Technology Roadmap

**Near-term (Months 1-3):**
- Multi-user support ✓
- Cost optimization ✓
- Web dashboard
- OAuth login
- Stripe integration

**Mid-term (Months 4-12):**
- Topic sharing/templates
- Zotero/Notion export
- Citation tracking
- Semantic search
- Browser extension

**Long-term (Year 2+):**
- Mobile apps
- Full-text analysis (Python service)
- Reading groups
- AI-powered recommendations
- White-label for institutions

---

## 9. Appendices

[Previous appendices from v1.0 remain valid]

### Appendix D: Multi-User SQL Schema (Complete)

**See Section 2.4.2 for complete multi-user schema**

### Appendix E: Cost Optimization Examples

**Two-Stage Triage Example:**
```
Input: 100 papers
Stage 1 (Haiku): 100 papers × $0.00014 = $0.014
Relevance filter (70% threshold): 60 papers pass
Stage 2 (Sonnet): 60 papers × $0.0024 = $0.144
Total: $0.158 (vs. $0.24 direct Sonnet = 34% savings)

With caching (50% hit rate):
New papers: 50 papers
Haiku: 50 × $0.00014 = $0.007
Sonnet: 30 × $0.0024 = $0.072
Total: $0.079 (67% savings)
```

### Appendix F: Rate Limiting Configuration

```typescript
const RATE_LIMITS = {
  // arXiv API: 1 request per 3 seconds
  arxiv: {
    capacity: 1,
    refillRate: 1/3,  // tokens per second
    burstSize: 1
  },
  
  // Anthropic Sonnet: 5 requests per second (conservative)
  anthropic: {
    capacity: 5,
    refillRate: 5,
    burstSize: 10
  },
  
  // Anthropic Haiku: 10 requests per second (faster model)
  anthropic_haiku: {
    capacity: 10,
    refillRate: 10,
    burstSize: 20
  }
};
```

---

## Document Change Log

**v1.0 (2025-11-29):**
- Initial PRD
- Single-user architecture
- Basic automation and MCP tools
- Direct Sonnet summarization

**v2.0 (2025-11-30):**
- ✅ Multi-user architecture (2+ users with independent topics)
- ✅ Critical technical fixes from Codex review:
  - Token bucket rate limiting (arXiv + Anthropic)
  - Checkpointed automation (scalability for 100+ papers)
  - Upsert logic with UNIQUE constraint (deduplication)
  - Exponential backoff retry logic
  - Comprehensive error handling
  - Security hardening (API key auth, input validation, quotas)
- ✅ Two-stage AI summarization (Haiku triage + Sonnet summary)
- ✅ Cost optimization (64% savings with caching)
- ✅ Budget guardrails (daily/monthly caps, circuit breaker)
- ✅ Enhanced observability (structured logging, cost tracking, alerts)
- ✅ Public/community deployment roadmap (4 phases)
- ✅ Updated implementation timeline (3 weeks with multi-user)
- ✅ Updated cost analysis (multi-user scenarios + freemium projections)

---

## Summary

This PRD defines a **production-ready, multi-user arXiv research assistant** with:

1. **Robust Architecture:**
   - Multi-user support with independent topic configurations
   - Per-user API authentication and quotas
   - Global rate limiting for external APIs
   - Checkpointed automation for scalability
   - Comprehensive error handling and recovery

2. **Cost-Effective AI:**
   - Two-stage summarization (Haiku triage + Sonnet summary)
   - 64% cost savings with intelligent caching
   - Budget guardrails ($1/day cap, alerts, circuit breaker)
   - Content hash-based deduplication

3. **Production Hardening:**
   - Rate limiting (token bucket algorithm)
   - Security (API key auth, input validation, quotas)
   - Observability (structured logging, cost tracking, alerts)
   - Monitoring (Cloudflare Analytics + custom queries)

4. **Clear Growth Path:**
   - Phase 1: Internal (2 users, $1/mo)
   - Phase 2: Beta (10-20 users, $5-15/mo)
   - Phase 3: Public (freemium, break-even at 50 paid users)
   - Phase 4: Community (5000+ users, $24k/mo profit potential)

**Next Steps:**
1. Begin Week 1 implementation (infrastructure + multi-user schema)
2. Create initial user accounts (you + wife)
3. Deploy with production hardening
4. Monitor costs and performance
5. Iterate based on feedback
6. Plan for beta launch (Month 2)


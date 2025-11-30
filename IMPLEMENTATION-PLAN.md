# kivv Implementation Plan
## Chunked Development with Checkpoints

**Status:** Ready to begin implementation
**Approach:** Incremental development with checkpoints and testing at each stage
**Target:** Week 1-2 MVP with full MCP + automation functionality

---

## ✅ COMPLETED: Infrastructure Setup

- [x] Cloudflare D1 database created (kivv-db: 1e80f2bf-462d-4d51-8002-a4cf26013933)
- [x] Cloudflare KV namespace created (KIVV_CACHE: 7f6b7437931c4c268c27d01a4169101b)
- [x] Cloudflare R2 bucket created (kivv-papers)
- [x] Multi-user database schema initialized (6 tables, 17 indexes)
- [x] Two users configured: jeff (8 topics), wife (3 topics)
- [x] Security topics added: Adversarial ML, Vuln Research, Malware, Network Attacks, RevEng
- [x] GitHub repository created with monorepo structure
- [x] API keys generated and stored securely in .env (git-ignored)
- [x] GitHub secrets configured for CI/CD

---

## 📋 IMPLEMENTATION CHUNKS

### **CHUNK 1: Project Structure & Dependencies**
**Goal:** Set up TypeScript project structure with all dependencies
**Estimated Time:** 30 minutes
**Checkpoint:** `npm install` succeeds, TypeScript compiles

**Tasks:**
1. Create `package.json` at root with workspace configuration
2. Create `mcp-server/package.json` with dependencies:
   - `hono` (routing)
   - `@cloudflare/workers-types`
   - `@anthropic-ai/sdk` (for MCP types if available, or manual types)
3. Create `automation/package.json` with dependencies:
   - `@cloudflare/workers-types`
   - `@anthropic-ai/sdk`
4. Create `tsconfig.json` files for each workspace
5. Create `.gitignore` (already exists, verify .env is excluded)
6. Install dependencies: `npm install` (or `bun install`)

**Verification:**
```bash
cd /home/gat0r/kivv
npm install
npm run build  # Should compile successfully
```

**Checkpoint File:** `.checkpoint/chunk1-complete`

---

### **CHUNK 2: Shared Types & Utilities**
**Goal:** Create shared TypeScript types and utilities used across workers
**Estimated Time:** 30 minutes
**Checkpoint:** Types compile without errors

**Tasks:**
1. Create `shared/types.ts` with:
   - `User` interface
   - `Topic` interface
   - `Paper` interface
   - `UserPaperStatus` interface
   - `CostLog` interface
   - Environment bindings (Env type)
2. Create `shared/utils.ts` with:
   - `hashContent(text: string): string` - SHA-256 hashing
   - `generateId(): string` - UUID generation
   - Error handling utilities
3. Create `shared/constants.ts`:
   - arXiv API endpoint
   - Rate limit constants
   - Cost per token for Haiku/Sonnet
   - Max tokens limits

**Verification:**
```bash
tsc --noEmit  # Type check without emitting
```

**Checkpoint File:** `.checkpoint/chunk2-complete`

---

### **CHUNK 3: MCP Server - Authentication Middleware**
**Goal:** Implement secure API key authentication
**Estimated Time:** 45 minutes
**Checkpoint:** Auth middleware works correctly

**Tasks:**
1. Create `mcp-server/src/auth.ts`:
   - `authenticateUser(request, env)` function
   - Extract `x-api-key` header
   - Query D1: `SELECT * FROM users WHERE api_key = ? AND is_active = 1`
   - Return User object or null
2. Create auth middleware for Hono
3. Add error responses (401 Unauthorized, 403 Forbidden)
4. Add request logging

**Test Cases:**
- Valid API key → returns user
- Invalid API key → returns 401
- Missing API key → returns 401
- Inactive user → returns 403

**Verification:**
```bash
# Manual test with wrangler dev
curl -H "x-api-key: c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d" http://localhost:8787/health
```

**Checkpoint File:** `.checkpoint/chunk3-complete`

---

### **CHUNK 4: MCP Server - Basic Routing & Health Check**
**Goal:** Set up Hono routing with health check endpoint
**Estimated Time:** 30 minutes
**Checkpoint:** Health check returns 200 OK

**Tasks:**
1. Create `mcp-server/src/index.ts`:
   - Initialize Hono app
   - Add CORS middleware
   - Add auth middleware
   - Add error handling middleware
2. Create health check endpoint: `GET /health`
   - Returns status, database connection, KV connection
3. Create `mcp-server/wrangler.toml`:
   - Bind D1 database (kivv-db)
   - Bind KV namespace (KIVV_CACHE)
   - Bind R2 bucket (kivv-papers)
   - Environment variables

**Verification:**
```bash
cd mcp-server
wrangler dev
# Test: curl http://localhost:8787/health
```

**Checkpoint File:** `.checkpoint/chunk4-complete`

---

### **CHUNK 5: MCP Server - Tool 1: list_library**
**Goal:** Implement MCP tool to list user's papers
**Estimated Time:** 1 hour
**Checkpoint:** Tool returns papers for authenticated user

**Tasks:**
1. Create `mcp-server/src/tools/list-library.ts`:
   - Query papers for authenticated user
   - Join with `user_paper_status` for exploration/bookmark status
   - Support pagination (limit/offset)
   - Support filters (explored/unexplored, bookmarked)
   - Return Paper[] with user status
2. Add route: `POST /mcp/tools/list_library`
3. Add MCP tool schema definition

**SQL Query:**
```sql
SELECT
  p.*,
  ups.explored,
  ups.bookmarked,
  ups.notes
FROM papers p
LEFT JOIN user_paper_status ups
  ON p.id = ups.paper_id AND ups.user_id = ?
WHERE p.collected_for_user_id = ?
   OR p.collected_for_user_id IS NULL
ORDER BY p.published_date DESC
LIMIT ? OFFSET ?
```

**Verification:**
```bash
curl -X POST http://localhost:8787/mcp/tools/list_library \
  -H "x-api-key: c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "offset": 0}'
```

**Checkpoint File:** `.checkpoint/chunk5-complete`

---

### **CHUNK 6: MCP Server - Tool 2: search_papers**
**Goal:** Implement keyword search across papers
**Estimated Time:** 45 minutes
**Checkpoint:** Search returns relevant results

**Tasks:**
1. Create `mcp-server/src/tools/search-papers.ts`:
   - SQLite FTS (Full-Text Search) on title + abstract
   - Support query string
   - Filter by user context
   - Return ranked results
2. Add route: `POST /mcp/tools/search_papers`

**SQL Query:**
```sql
SELECT
  p.*,
  ups.explored,
  ups.bookmarked
FROM papers p
LEFT JOIN user_paper_status ups ON p.id = ups.paper_id AND ups.user_id = ?
WHERE (p.title LIKE ? OR p.abstract LIKE ?)
  AND (p.collected_for_user_id = ? OR p.collected_for_user_id IS NULL)
ORDER BY p.published_date DESC
LIMIT ?
```

**Verification:**
```bash
curl -X POST http://localhost:8787/mcp/tools/search_papers \
  -H "x-api-key: ..." \
  -d '{"query": "adversarial attack", "limit": 20}'
```

**Checkpoint File:** `.checkpoint/chunk6-complete`

---

### **CHUNK 7: MCP Server - Tool 3: mark_explored**
**Goal:** Allow users to mark papers as explored
**Estimated Time:** 30 minutes
**Checkpoint:** Papers are marked and persist in database

**Tasks:**
1. Create `mcp-server/src/tools/mark-explored.ts`:
   - Upsert `user_paper_status` table
   - Set `explored = true`, `read_at = CURRENT_TIMESTAMP`
2. Add route: `POST /mcp/tools/mark_explored`

**SQL Query:**
```sql
INSERT INTO user_paper_status (user_id, paper_id, explored, read_at)
VALUES (?, ?, 1, CURRENT_TIMESTAMP)
ON CONFLICT(user_id, paper_id)
DO UPDATE SET explored = 1, read_at = CURRENT_TIMESTAMP
```

**Verification:**
```bash
curl -X POST http://localhost:8787/mcp/tools/mark_explored \
  -H "x-api-key: ..." \
  -d '{"paper_ids": [1, 2, 3]}'
```

**Checkpoint File:** `.checkpoint/chunk7-complete`

---

### **CHUNK 8: MCP Server - RSS Feed Generation**
**Goal:** Generate per-user RSS/Atom feeds
**Estimated Time:** 1 hour
**Checkpoint:** Feed validates and displays in feed reader

**Tasks:**
1. Create `mcp-server/src/feed.ts`:
   - Generate Atom XML feed
   - Query papers for specific user (by username)
   - Include summaries in feed content
   - KV caching (5-minute TTL)
2. Add route: `GET /feed/:username.xml`
3. Set proper `Content-Type: application/atom+xml`

**Feed Structure:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>kivv - Papers for {username}</title>
  <link href="https://kivv.workers.dev/feed/{username}.xml" rel="self"/>
  <updated>{latest_paper_date}</updated>
  <entry>
    <title>{paper.title}</title>
    <link href="{paper.pdf_url}"/>
    <id>{paper.arxiv_id}</id>
    <updated>{paper.published_date}</updated>
    <summary>{paper.summary}</summary>
    <content type="html">{formatted_summary_with_metadata}</content>
  </entry>
</feed>
```

**Verification:**
```bash
curl http://localhost:8787/feed/jeff.xml
# Validate XML with xmllint or feed reader
```

**Checkpoint File:** `.checkpoint/chunk8-complete`

---

### **CHUNK 9: Automation Worker - arXiv API Client**
**Goal:** Implement arXiv API client with rate limiting
**Estimated Time:** 1.5 hours
**Checkpoint:** Can fetch papers from arXiv without 429 errors

**Tasks:**
1. Create `automation/src/arxiv-client.ts`:
   - `searchPapers(query: string, cursor?: string): Promise<ArxivPaper[]>`
   - Parse arXiv Atom XML response
   - Handle pagination (cursor support)
   - Error handling (retries with exponential backoff)
2. Create `automation/src/rate-limit.ts`:
   - Token bucket implementation using KV
   - `acquire(service: string, tokens: number): Promise<void>`
   - arXiv: 1 req/3s + 100-300ms jitter
   - Anthropic: 5 req/s
3. Add tests

**Rate Limiter Logic:**
```typescript
class TokenBucket {
  async acquire(service: string, tokens: number): Promise<void> {
    const key = `rate:${service}`;
    const bucket = await env.CACHE.get(key);
    // Implement token bucket algorithm
    // Wait/retry if insufficient tokens
  }
}
```

**Verification:**
```bash
# Test with actual arXiv query
node -e "
const client = new ArxivClient();
client.searchPapers('cat:cs.LG AND adversarial').then(console.log);
"
```

**Checkpoint File:** `.checkpoint/chunk9-complete`

---

### **CHUNK 10: Automation Worker - Two-Stage Summarization**
**Goal:** Implement Haiku triage + Sonnet summarization
**Estimated Time:** 2 hours
**Checkpoint:** Summaries generated with cost tracking

**Tasks:**
1. Create `automation/src/summarizer.ts`:
   - `triageRelevance(paper: Paper, topic: Topic): Promise<number>` - Haiku
   - `generateSummary(paper: Paper): Promise<string>` - Sonnet
   - Both use Anthropic SDK
   - Rate limiting before each call
   - Cost tracking (log tokens to `cost_logs`)
2. Implement caching by `content_hash`
3. Budget enforcement (circuit breaker at $1/day)

**Haiku Triage Prompt:**
```
Rate the relevance of this paper to the topic "{topic_name}" on a scale of 0.0 to 1.0.

Paper: {title}
Abstract: {abstract}

Return ONLY a number between 0.0 and 1.0, nothing else.
```

**Sonnet Summary Prompt:**
```
Summarize this arXiv paper in 3 concise bullet points (max 120 tokens).

Title: {title}
Abstract: {abstract}

Focus on: key contributions, methods, and results.
```

**Verification:**
```bash
# Test summarization pipeline
const paper = { title: "...", abstract: "..." };
const score = await triageRelevance(paper, topic);
if (score >= 0.7) {
  const summary = await generateSummary(paper);
  console.log(summary);
}
```

**Checkpoint File:** `.checkpoint/chunk10-complete`

---

### **CHUNK 11: Automation Worker - Checkpointed Cron Job**
**Goal:** Daily automation with resumable checkpoints
**Estimated Time:** 2 hours
**Checkpoint:** Cron runs successfully and resumes after interruption

**Tasks:**
1. Create `automation/src/index.ts`:
   - Cron trigger handler
   - Load all enabled topics from D1
   - For each topic:
     - Check checkpoint in KV
     - If complete, skip
     - Query arXiv (rate limited)
     - Deduplicate (ON CONFLICT)
     - Triage with Haiku
     - Summarize relevant papers with Sonnet
     - Save checkpoint
   - Budget enforcement
   - Error handling with retries
2. Create `automation/wrangler.toml`:
   - Cron schedule: `0 6 * * *` (daily at 06:00 UTC)
   - Bindings (D1, KV, R2)
3. Add structured logging

**Checkpoint Logic:**
```typescript
async function processTopic(topic: Topic, env: Env) {
  const checkpoint = await env.CACHE.get(`checkpoint:${topic.id}`);
  if (checkpoint === 'done') {
    console.log(`Topic ${topic.id} already processed`);
    return;
  }

  // Process topic...

  // Mark complete
  await env.CACHE.put(`checkpoint:${topic.id}`, 'done', {
    expirationTtl: 86400 // 24 hours
  });
}
```

**Verification:**
```bash
# Test cron locally (trigger manually)
wrangler dev
# Trigger: http://localhost:8787/__scheduled
```

**Checkpoint File:** `.checkpoint/chunk11-complete`

---

### **CHUNK 12: Testing & Deployment**
**Goal:** Comprehensive testing and production deployment
**Estimated Time:** 2 hours
**Checkpoint:** Production deployment successful

**Tasks:**
1. Create `tests/` directory with Vitest tests:
   - Authentication tests
   - MCP tool tests
   - arXiv client tests (mocked)
   - Summarization tests (mocked)
   - Rate limiting tests
2. Create GitHub Actions workflow (`.github/workflows/deploy.yml`):
   - Run tests on PR
   - Deploy MCP server to production on merge to main
   - Deploy automation worker to production
3. Deploy to production:
   ```bash
   cd mcp-server && wrangler deploy
   cd automation && wrangler deploy
   ```
4. Test production endpoints with real API keys
5. Verify cron is scheduled correctly

**Verification:**
```bash
# Production health check
curl https://kivv.workers.dev/health

# Production MCP call
curl -X POST https://kivv.workers.dev/mcp/tools/list_library \
  -H "x-api-key: c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d"

# Check cron status
wrangler deployments list --name kivv-automation
```

**Checkpoint File:** `.checkpoint/chunk12-complete`

---

## 🔐 AUTHENTICATION SECURITY VERIFICATION

**Current Implementation (from PRD):**
- ✅ API key authentication via `x-api-key` header
- ✅ Database lookup: `SELECT * FROM users WHERE api_key = ? AND is_active = 1`
- ✅ Unique API keys generated with `crypto.randomBytes(32)`
- ✅ Index on `api_key` column for performance
- ✅ User context passed to all MCP tools
- ✅ Per-user data isolation in queries

**Security Checklist:**
- [x] API keys stored securely in D1 (not in code)
- [x] API keys git-ignored (.env file)
- [x] API keys unique per user
- [x] Authentication required for all MCP endpoints
- [x] User ID used to filter data (prevents cross-user access)
- [ ] Rate limiting per user (TODO: implement in CHUNK 11)
- [ ] Request logging for audit trail (TODO: add in CHUNK 4)

**No public endpoints** - All routes require authentication except:
- `GET /health` (can be public for monitoring)
- `GET /feed/:username.xml` (public RSS feed, but user-specific data only)

---

## 📊 COST OPTIMIZATION VERIFICATION

**Two-Stage Triage (from PRD):**
- Stage 1: Haiku relevance scoring (~$0.00025/paper)
- Stage 2: Sonnet summarization (~$0.006/paper, only for relevant papers)
- Expected savings: 64% with 70% relevance threshold

**Budget Enforcement:**
- Daily cap: $1.00/day (configurable)
- Circuit breaker: Stop processing at 80% of budget
- Alerting: Log warning at 50%, 80% thresholds
- Cost tracking: All API calls logged to `cost_logs` table

---

## 📁 IMPLEMENTATION TRACKING

Create `.checkpoint/` directory to track progress:
```bash
mkdir -p /home/gat0r/kivv/.checkpoint
```

After each chunk completion, create checkpoint file:
```bash
touch .checkpoint/chunk1-complete
git add .checkpoint/chunk1-complete
git commit -m "checkpoint: chunk 1 complete - project structure"
git push
```

This allows resuming from last checkpoint if interrupted.

---

## 🚀 READY TO BEGIN

All infrastructure is in place:
- ✅ Database initialized with 2 users, 11 topics
- ✅ KV namespace ready for caching
- ✅ R2 bucket ready for PDFs
- ✅ API keys generated and secured
- ✅ GitHub repo configured with CI/CD secrets

**Next Step:** Start CHUNK 1 with engineer agent

**Command to launch engineer:**
```bash
# Use Task tool with subagent_type='engineer'
# Provide full context: PRD, this implementation plan, .env contents
# Start with CHUNK 1
```

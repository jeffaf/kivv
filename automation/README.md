# kivv Automation Worker

Daily automation worker for paper discovery, summarization, and storage.

## Overview

The automation worker runs daily at **6 AM UTC** via Cloudflare cron trigger. It processes all active users, fetches papers from arXiv matching their topics, generates AI summaries, and stores results in the database.

### Key Features

- **Checkpointed Execution**: Resumes from last successful user on failure
- **Budget Enforcement**: Stops at $1/day circuit breaker
- **Two-Stage AI**: Haiku triage (fast) + Sonnet summaries (quality)
- **Rate Limiting**: Respects arXiv (1 req/3s) and Anthropic (5 req/s) limits
- **Error Resilience**: Continues processing other users/papers on errors
- **Multi-User Support**: Processes all active users independently

## Architecture

### Workflow

```
1. Load checkpoint (resume if exists)
2. Fetch all active users from database
3. For each user:
   a. Get enabled topics
   b. Build combined arXiv query (OR all topics)
   c. Search arXiv for papers (last 24 hours)
   d. For each paper:
      - Check if exists (skip duplicates)
      - Triage with Haiku (relevance score)
      - Summarize with Sonnet (if relevant)
      - Store in database with user association
   e. Save checkpoint after each user
   f. Check budget (stop if >= $1)
4. Mark checkpoint as completed
5. Cleanup old checkpoints
```

### Checkpoint Structure

Stored in KV with key: `checkpoint:automation:{YYYY-MM-DD}`

```typescript
interface Checkpoint {
  date: string;                    // YYYY-MM-DD
  users_processed: number;         // Count of users completed
  papers_found: number;            // Total papers found from arXiv
  papers_summarized: number;       // Total papers successfully summarized
  total_cost: number;              // Total AI cost in USD
  errors: string[];                // Array of error messages
  last_user_id?: number;           // Last successfully processed user ID
  completed: boolean;              // True when all users processed
}
```

**TTL**: 7 days (auto-expires)

## Configuration

### wrangler.toml

```toml
# Cron trigger: Daily at 6 AM UTC
[triggers]
crons = ["0 6 * * *"]

# Bindings
[[d1_databases]]
binding = "DB"
database_name = "kivv-db"
database_id = "1e80f2bf-462d-4d51-8002-a4cf26013933"

[[kv_namespaces]]
binding = "CACHE"
id = "7f6b7437931c4c268c27d01a4169101b"

[[r2_buckets]]
binding = "PAPERS"
bucket_name = "kivv-papers"
```

### Environment Variables

Set via `wrangler secret put`:

```bash
# Required
wrangler secret put CLAUDE_API_KEY

# Optional (for manual trigger)
wrangler secret put CRON_SECRET
```

## Endpoints

### 1. Cron Trigger (Automatic)

**Trigger**: Daily at 6 AM UTC
**Authentication**: Automatic via Cloudflare
**Action**: Runs full automation workflow

### 2. Health Check

```
GET /health
```

**Response**:
```json
{
  "status": "ok",
  "service": "kivv-automation",
  "timestamp": "2025-11-30T06:00:00.000Z"
}
```

### 3. Manual Trigger

```
POST /run
Authorization: Bearer {CRON_SECRET}
```

**Response** (Success):
```json
{
  "success": true,
  "message": "Automation completed successfully",
  "timestamp": "2025-11-30T06:00:00.000Z"
}
```

**Response** (Error):
```json
{
  "success": false,
  "error": "Budget exceeded",
  "timestamp": "2025-11-30T06:00:00.000Z"
}
```

## Database Operations

### Papers Table

```sql
INSERT INTO papers (
  arxiv_id, title, authors, abstract, categories,
  published_date, pdf_url, summary, summary_generated_at,
  summary_model, relevance_score, content_hash,
  collected_for_user_id, created_at
)
VALUES (...)
```

**Deduplication**: Unique constraint on `arxiv_id` prevents duplicates

### User Paper Status Table

```sql
INSERT INTO user_paper_status (
  user_id, paper_id, explored, bookmarked, created_at
)
VALUES (...)
```

Creates initial status entry for each user-paper pair.

## Cost Optimization

### Budget Breakdown

- **Haiku Triage**: ~$0.00025 per paper
- **Sonnet Summary**: ~$0.006 per paper (only for relevant papers)
- **Daily Budget**: $1.00 maximum

### Example Costs

| Papers | Relevant (70%) | Haiku Cost | Sonnet Cost | Total |
|--------|----------------|------------|-------------|-------|
| 100    | 70             | $0.025     | $0.420      | $0.445 |
| 200    | 140            | $0.050     | $0.840      | $0.890 |
| 225    | 157            | $0.056     | $0.942      | $0.998 |

**Savings**: ~96% cost reduction compared to summarizing all papers

## Error Handling

### User-Level Errors

- **Behavior**: Log error, save checkpoint, continue with next user
- **Logged**: Added to `checkpoint.errors[]`
- **Example**: User has no enabled topics, API timeout

### Paper-Level Errors

- **Behavior**: Log error, continue with next paper
- **Not Logged**: Not added to checkpoint (too granular)
- **Example**: Summarization failed, database insert error

### Circuit Breakers

1. **Budget Exceeded**: Stop at $1.00, save checkpoint
2. **Rate Limits**: Enforced automatically by clients (arXiv, Anthropic)

## Monitoring

### Logs

All logs include structured context:

```
[CRON] Starting daily automation at 2025-11-30T06:00:00.000Z
[AUTOMATION] Processing 2 users
[USER:jeff] Processing 3 topics
[USER:jeff] Search query: (cat:cs.AI AND safety) OR (cat:cs.LG)
[USER:jeff] Found 25 papers from arXiv
[PAPER:2311.12345] Stored with summary (relevance: 0.85)
[USER:jeff] Completed: 25 found, 18 summarized, $0.1234 cost
[CHECKPOINT] Saved: 1 users, $0.1234 cost
[BUDGET] Daily budget ($1.00) exceeded, stopping automation
[AUTOMATION] ===== SUMMARY =====
[AUTOMATION] Users processed: 2
[AUTOMATION] Papers found: 50
[AUTOMATION] Papers summarized: 35
[AUTOMATION] Total cost: $0.4567
[AUTOMATION] Errors: 0
```

### Cloudflare Dashboard

- View cron trigger history
- See execution logs and errors
- Monitor worker performance

## Testing

### Run Tests

```bash
bun test tests/integration/automation.test.ts
```

### Test Coverage

- ✅ Checkpoint creation and loading
- ✅ Resume from last_user_id
- ✅ Budget tracking and circuit breaker
- ✅ Error handling (user-level and paper-level)
- ✅ Authentication (cron header and Bearer token)
- ✅ User processing and topic queries
- ✅ Paper deduplication

## Deployment

### Initial Deployment

```bash
# Navigate to automation directory
cd automation

# Deploy to Cloudflare
wrangler deploy

# Set secrets
wrangler secret put CLAUDE_API_KEY
wrangler secret put CRON_SECRET  # Optional
```

### Update Deployment

```bash
# After code changes
wrangler deploy
```

### View Logs

```bash
# Tail live logs
wrangler tail

# View logs in dashboard
# https://dash.cloudflare.com -> Workers & Pages -> kivv-automation -> Logs
```

## Troubleshooting

### Checkpoint Not Resuming

**Symptom**: Worker restarts from beginning after failure
**Cause**: Checkpoint not saved or expired
**Solution**: Check KV namespace bindings, verify checkpoint TTL (7 days)

### Budget Exceeded Too Quickly

**Symptom**: Worker stops after processing few users
**Cause**: Too many relevant papers, high relevance threshold
**Solution**: Adjust per-topic `max_papers_per_day`, increase relevance threshold to 0.8

### Papers Not Appearing in Database

**Symptom**: Papers found but not stored
**Cause**: Failing relevance triage, database errors
**Solution**: Check logs for triage scores, verify database schema and bindings

### arXiv Rate Limit Errors

**Symptom**: HTTP 503 from arXiv
**Cause**: Too many requests too quickly
**Solution**: ArxivClient enforces 1 req/3s + jitter automatically, check for duplicate searches

## Future Enhancements

- [ ] **Email Notifications**: Daily summary report to users
- [ ] **PDF Download**: Store papers in R2 bucket
- [ ] **Advanced Filtering**: Category-specific relevance thresholds
- [ ] **Retry Logic**: Exponential backoff for transient failures
- [ ] **Analytics**: Cost breakdown per topic, user engagement metrics
- [ ] **Smart Scheduling**: Process users at different times based on activity

## Related Documentation

- [Main README](../README.md) - Project overview
- [MCP Server](../mcp-server/README.md) - MCP tools and RSS feed
- [Database Schema](../shared/schema.sql) - D1 table structure
- [Shared Utilities](../shared/) - ArxivClient, SummarizationClient

# kivv Production Deployment Guide

Complete guide for deploying kivv to production, testing all components, and verifying system readiness.

## 📋 Prerequisites

Before deploying, ensure you have:

- ✅ Cloudflare account with Workers, D1, KV, and R2 enabled
- ✅ Anthropic Claude API key (from console.anthropic.com)
- ✅ Bun 1.1+ installed locally ([bun.sh](https://bun.sh))
- ✅ Wrangler CLI authenticated (`wrangler whoami`)
- ✅ Git repository cloned and dependencies installed

## 🚀 Deployment Steps

### Step 1: Verify Environment Setup

```bash
# Ensure you're in the kivv directory
cd /path/to/kivv

# Verify bun is installed
bun --version

# Verify wrangler authentication
wrangler whoami
# Expected: Shows your Cloudflare email and account ID

# Verify environment configuration
cat .env
# Should contain: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLAUDE_API_KEY

# Check infrastructure is already created
wrangler d1 list | grep kivv-db
wrangler kv:namespace list | grep KIVV_CACHE
wrangler r2 bucket list | grep kivv-papers
```

**Infrastructure Already Configured:**
- D1 Database: `kivv-db` (ID: 1e80f2bf-462d-4d51-8002-a4cf26013933)
- KV Namespace: `KIVV_CACHE` (ID: 7f6b7437931c4c268c27d01a4169101b)
- R2 Bucket: `kivv-papers`

### Step 2: Set Worker Secrets

**For Automation Worker:**

```bash
cd automation

# Set Claude API key for AI summarization
wrangler secret put CLAUDE_API_KEY
# Paste your Anthropic API key when prompted (starts with sk-ant-...)

# Set manual trigger secret (for testing)
wrangler secret put CRON_SECRET
# Generate secure secret: openssl rand -hex 32
# Or use: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

cd ..
```

**Security Note:** Secrets are encrypted and never exposed in logs or code.

### Step 3: Deploy Automation Worker

```bash
cd automation

# Deploy to Cloudflare Workers
wrangler deploy

# Expected output:
# ✨ Built successfully!
# 📥 Uploaded to Cloudflare
# ✨ Deployment complete!
# Worker URL: https://kivv-automation.<username>.workers.dev
```

**Verify Deployment:**

```bash
# Test health check endpoint
curl https://kivv-automation.<username>.workers.dev/health

# Expected response:
# {"status":"ok","service":"kivv-automation","timestamp":"2024-11-30T..."}
```

**Verify Cron Schedule:**

1. Go to Cloudflare Dashboard: https://dash.cloudflare.com
2. Navigate to **Workers & Pages** → **kivv-automation**
3. Click **Triggers** tab
4. Verify cron trigger: `0 6 * * *` (daily at 6 AM UTC)
5. Note next scheduled run time

### Step 4: Deploy MCP Server

```bash
cd ../mcp-server

# Deploy to Cloudflare Workers
wrangler deploy

# Expected output:
# ✨ Built successfully!
# 📥 Uploaded to Cloudflare
# ✨ Deployment complete!
# Worker URL: https://kivv-mcp.<username>.workers.dev
```

**Verify Deployment:**

```bash
# Test health check endpoint (no authentication required)
curl https://kivv-mcp.<username>.workers.dev/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2024-11-30T...",
#   "services": {
#     "database": "connected",
#     "cache": "connected",
#     "storage": "connected"
#   }
# }
```

### Step 5: Test MCP Tools with Authentication

**Get API Key from Database:**

```bash
# Query users to find API key
wrangler d1 execute kivv-db --command "SELECT username, api_key FROM users"

# Example output:
# ┌──────────┬──────────────────────────────────────────────────────┐
# │ username │ api_key                                              │
# ├──────────┼──────────────────────────────────────────────────────┤
# │ jeff     │ abc123...                                            │
# │ wife     │ def456...                                            │
# └──────────┴──────────────────────────────────────────────────────┘
```

**Test `list_library` Tool:**

```bash
# Replace YOUR_API_KEY with actual API key from above
export KIVV_API_KEY="your_api_key_here"

curl -X POST https://kivv-mcp.<username>.workers.dev/mcp/tools/list_library \
  -H "x-api-key: $KIVV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "offset": 0}'

# Expected response (before automation runs):
# {
#   "papers": [],
#   "total": 0,
#   "limit": 10,
#   "offset": 0
# }
```

**Test `search_papers` Tool:**

```bash
curl -X POST https://kivv-mcp.<username>.workers.dev/mcp/tools/search_papers \
  -H "x-api-key: $KIVV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "transformers", "limit": 5}'

# Expected response (before automation runs):
# {
#   "results": [],
#   "total": 0,
#   "query": "transformers"
# }
```

**Test RSS Feed:**

```bash
# Get username from database
curl https://kivv-mcp.<username>.workers.dev/feeds/jeff/rss.xml

# Expected: Valid RSS XML (empty channel until papers collected)
```

### Step 6: Manual Trigger Test (Optional)

Test automation worker manually before waiting for cron:

```bash
# Get CRON_SECRET you set in Step 2
# Then trigger automation manually:

curl -X POST https://kivv-automation.<username>.workers.dev/run \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Expected response (200 OK):
# "Automation completed successfully"

# Check logs in Cloudflare Dashboard:
# Workers → kivv-automation → Logs (Real-time)
```

**Verify Papers Were Collected:**

```bash
# Check papers count
wrangler d1 execute kivv-db --command "SELECT COUNT(*) as total FROM papers"

# Check recent papers
wrangler d1 execute kivv-db --command "
  SELECT arxiv_id, title, published_date
  FROM papers
  ORDER BY published_date DESC
  LIMIT 5
"

# Check checkpoint in KV
wrangler kv:key get --namespace-id=7f6b7437931c4c268c27d01a4169101b \
  "checkpoint:automation:$(date +%Y-%m-%d)"
```

### Step 7: Configure Claude Desktop MCP Integration

**Locate Configuration File:**

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Create or Update Configuration:**

```json
{
  "mcpServers": {
    "kivv": {
      "url": "https://kivv-mcp.<username>.workers.dev/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Replace Values:**
- `<username>`: Your Cloudflare Workers subdomain (from Step 4 deployment output)
- `YOUR_API_KEY`: Your user's API key from database (Step 5)

**Restart Claude Desktop:**

Close and reopen Claude Desktop app to load new MCP configuration.

**Test MCP Integration:**

1. Open Claude Desktop
2. Start a new conversation
3. Type: "List my research papers using the kivv MCP"
4. Claude should call the `list_library` tool and show results
5. Type: "Search for papers about transformers"
6. Claude should call the `search_papers` tool

## ✅ Deployment Verification Checklist

Use this checklist to verify complete deployment:

### Infrastructure
- [ ] D1 database exists and contains schema (2 tables: users, topics, papers, etc.)
- [ ] KV namespace created and accessible
- [ ] R2 bucket created and accessible
- [ ] Database has 2 users (jeff, wife) with API keys
- [ ] Database has 11 topics configured and enabled

### Automation Worker
- [ ] Worker deployed successfully
- [ ] CLAUDE_API_KEY secret set
- [ ] CRON_SECRET secret set (optional)
- [ ] Health check endpoint returns `{"status":"ok"}`
- [ ] Cron trigger configured (6 AM UTC daily)
- [ ] Manual trigger works (if CRON_SECRET set)
- [ ] Logs show successful execution

### MCP Server
- [ ] Worker deployed successfully
- [ ] Health check endpoint returns `{"status":"healthy"}`
- [ ] Database connection verified
- [ ] API key authentication works
- [ ] `list_library` tool returns results
- [ ] `search_papers` tool returns results
- [ ] `mark_explored` tool works
- [ ] RSS feeds accessible

### Claude Desktop Integration
- [ ] MCP configuration file created/updated
- [ ] Claude Desktop restarted
- [ ] MCP connection established (check Claude settings)
- [ ] Tools appear in Claude conversation
- [ ] Can list papers via Claude
- [ ] Can search papers via Claude
- [ ] Can mark papers as explored

### End-to-End Workflow
- [ ] Automation runs successfully (manual or cron)
- [ ] Papers collected from arXiv
- [ ] Papers saved to database
- [ ] Checkpoints saved to KV
- [ ] Papers appear in MCP tools
- [ ] Papers appear in RSS feeds
- [ ] User can mark papers as explored
- [ ] Explored papers excluded from future feeds

### Monitoring & Costs
- [ ] Cloudflare dashboard shows worker metrics
- [ ] No errors in worker logs
- [ ] Database within free tier limits (5GB, 5M reads/day)
- [ ] KV within free tier limits (100k reads/day)
- [ ] R2 within free tier limits (10GB storage)
- [ ] Claude API costs within budget (~$3-9/month)

## 📊 Monitoring & Observability

### Cloudflare Dashboard Monitoring

**Access Dashboard:**
1. Go to https://dash.cloudflare.com
2. Navigate to **Workers & Pages**

**Monitor Automation Worker:**
1. Click **kivv-automation**
2. View tabs:
   - **Metrics**: Request count, CPU time, errors
   - **Logs**: Real-time logs (click "Begin log stream")
   - **Triggers**: Cron schedule and next run time
   - **Settings**: Environment variables and bindings

**Monitor MCP Server:**
1. Click **kivv-mcp**
2. View same tabs as automation worker
3. Check metrics for API usage patterns

### Database Monitoring

```bash
# Check database info and size
wrangler d1 info kivv-db

# Count total papers
wrangler d1 execute kivv-db --command "SELECT COUNT(*) as total FROM papers"

# Check papers by user
wrangler d1 execute kivv-db --command "
  SELECT u.username, COUNT(up.paper_id) as paper_count
  FROM users u
  LEFT JOIN user_papers up ON u.id = up.user_id
  GROUP BY u.username
"

# Check recent errors (if error_log table exists)
wrangler d1 execute kivv-db --command "
  SELECT timestamp, error_type, message
  FROM error_log
  ORDER BY timestamp DESC
  LIMIT 10
"
```

### KV Namespace Monitoring

```bash
# List all checkpoints
wrangler kv:key list --namespace-id=7f6b7437931c4c268c27d01a4169101b --prefix="checkpoint:"

# Get specific checkpoint
wrangler kv:key get --namespace-id=7f6b7437931c4c268c27d01a4169101b \
  "checkpoint:automation:2024-11-30"

# Check cache hit rate (manual observation from logs)
wrangler tail kivv-mcp --format=pretty | grep "cache_hit"
```

### Real-Time Log Streaming

```bash
# Stream automation worker logs
wrangler tail kivv-automation --format=pretty

# Stream MCP server logs
wrangler tail kivv-mcp --format=pretty

# Filter for errors only
wrangler tail kivv-mcp --format=pretty | grep -i error

# Filter for specific user activity
wrangler tail kivv-mcp --format=pretty | grep "user_id=1"
```

### Cost Monitoring

**Expected Monthly Costs (2 users, 10 topics, 50 papers/day):**

| Service | Usage | Cost |
|---------|-------|------|
| Cloudflare Workers (automation) | ~30 requests/day | Free tier |
| Cloudflare Workers (MCP) | ~500 requests/day | Free tier |
| D1 Database | ~10k reads/day, ~500 writes/day | Free tier |
| KV Namespace | ~1k reads/day, ~30 writes/day | Free tier |
| R2 Storage | ~500 MB (PDFs) | Free tier |
| Claude API (Haiku + Sonnet) | ~40 papers/day | $3-9/month |

**Total Estimated Cost: $3-9/month**

**Monitor Claude API Usage:**
1. Go to https://console.anthropic.com/settings/billing
2. Check current month usage
3. Set up billing alerts (recommended: $10/month threshold)

**Cost Optimization Tips:**
- Reduce topic count to decrease papers collected
- Adjust relevance threshold to filter more aggressively
- Use Haiku model for all summarization (cheaper but lower quality)
- Reduce automation frequency (change cron to weekly)

## 🔧 Troubleshooting Guide

### Automation Worker Issues

**Problem: Automation not running on schedule**

```bash
# Check cron trigger configuration
cat automation/wrangler.toml | grep -A2 "\[triggers\]"

# Verify next scheduled run in dashboard
# Go to: Cloudflare Dashboard → Workers → kivv-automation → Triggers

# Manually trigger to test
curl -X POST https://kivv-automation.<username>.workers.dev/run \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Problem: No papers being collected**

```bash
# Check topics are enabled
wrangler d1 execute kivv-db --command "
  SELECT user_id, topic_name, enabled
  FROM topics
  WHERE enabled = 1
"

# Check automation logs for errors
wrangler tail kivv-automation --format=pretty

# Verify Claude API key is set
wrangler secret list --name kivv-automation
# Should show: CLAUDE_API_KEY (encrypted)
```

**Problem: Claude API errors**

```bash
# Check API key is valid
# Test manually: curl https://api.anthropic.com/v1/messages \
#   -H "x-api-key: YOUR_KEY" \
#   -H "anthropic-version: 2023-06-01" \
#   -H "content-type: application/json" \
#   -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'

# Check quota limits
# Go to: https://console.anthropic.com/settings/limits

# Review error logs
wrangler tail kivv-automation --format=pretty | grep "claude_api_error"
```

### MCP Server Issues

**Problem: MCP tools not working in Claude Desktop**

```bash
# Verify MCP server is deployed and healthy
curl https://kivv-mcp.<username>.workers.dev/health

# Verify API key authentication
curl -X POST https://kivv-mcp.<username>.workers.dev/mcp/tools/list_library \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Check Claude Desktop config syntax
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
# Must be valid JSON!

# Restart Claude Desktop
# macOS: Cmd+Q, then reopen
# Check MCP status in Claude settings
```

**Problem: Authentication failures (401 errors)**

```bash
# Verify API key in database
wrangler d1 execute kivv-db --command "SELECT username, api_key FROM users"

# Check API key matches config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | grep api-key

# Test with correct API key
curl -X POST https://kivv-mcp.<username>.workers.dev/mcp/tools/list_library \
  -H "x-api-key: CORRECT_KEY_FROM_DB" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Problem: RSS feeds empty or not updating**

```bash
# Check papers exist in database
wrangler d1 execute kivv-db --command "
  SELECT COUNT(*) as total
  FROM papers
  WHERE explored = 0
"

# Verify RSS endpoint
curl https://kivv-mcp.<username>.workers.dev/feeds/jeff/rss.xml

# Check RSS XML is valid
curl https://kivv-mcp.<username>.workers.dev/feeds/jeff/rss.xml | xmllint -

# Clear KV cache if needed
wrangler kv:key delete --namespace-id=7f6b7437931c4c268c27d01a4169101b "rss:jeff"
```

### Database Issues

**Problem: Database connection errors**

```bash
# Verify database exists
wrangler d1 list | grep kivv-db

# Test database connection
wrangler d1 execute kivv-db --command "SELECT 1"

# Check database info
wrangler d1 info kivv-db

# Verify wrangler.toml has correct database_id
grep database_id mcp-server/wrangler.toml
grep database_id automation/wrangler.toml
```

**Problem: Schema errors or missing tables**

```bash
# List all tables
wrangler d1 execute kivv-db --command "
  SELECT name FROM sqlite_master WHERE type='table'
"

# Recreate schema if needed (CAUTION: drops all data)
wrangler d1 execute kivv-db --file=mcp-server/schema.sql --remote

# Backup before recreating
wrangler d1 export kivv-db --output=backup-$(date +%Y%m%d).sql
```

### Deployment Issues

**Problem: Wrangler authentication failures**

```bash
# Check authentication
wrangler whoami

# Re-authenticate if needed
wrangler login

# Verify API token has correct permissions
# Go to: https://dash.cloudflare.com/profile/api-tokens
# Required: Workers Scripts (Edit), D1 (Edit), R2 (Edit)
```

**Problem: Deployment fails with build errors**

```bash
# Run type checking locally
bun run type-check

# Build locally first
cd mcp-server && bun run build
cd ../automation && bun run build

# Deploy with verbose output
wrangler deploy --verbose

# Check wrangler.toml syntax
wrangler deploy --dry-run
```

**Problem: Worker exceeds limits (CPU, memory)**

```bash
# Check worker metrics in dashboard
# Workers → kivv-mcp → Metrics

# Optimize code:
# - Add pagination to database queries
# - Implement caching for expensive operations
# - Reduce batch sizes

# Consider upgrading to Workers paid plan if needed
# Go to: Account → Workers → Limits
```

## 🔄 Rollback Procedures

### Rollback Worker Deployment

```bash
# List recent deployments
wrangler deployments list --name kivv-automation

# Rollback to previous version
wrangler rollback --deployment-id=<previous-deployment-id>

# Verify rollback
curl https://kivv-automation.<username>.workers.dev/health
```

### Restore Database Backup

```bash
# Export current state first
wrangler d1 export kivv-db --output=backup-before-restore.sql

# Restore from backup
wrangler d1 execute kivv-db --file=backup-2024-11-30.sql --remote

# Verify restoration
wrangler d1 execute kivv-db --command "SELECT COUNT(*) FROM papers"
```

### Revert Configuration Changes

```bash
# Restore previous wrangler.toml
git checkout HEAD~1 -- automation/wrangler.toml

# Redeploy with old config
wrangler deploy
```

## 🔐 Security Best Practices

### Secrets Management

1. **Never commit secrets to git**
   - Use `.gitignore` for `.env` files
   - Use `wrangler secret put` for worker secrets
   - Use GitHub secrets for CI/CD

2. **Rotate API keys regularly**
   ```bash
   # Generate new API key for user
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

   # Update in database
   wrangler d1 execute kivv-db --command "
     UPDATE users
     SET api_key = 'new_key_here'
     WHERE username = 'jeff'
   "
   ```

3. **Monitor for unauthorized access**
   ```bash
   # Check for failed authentication attempts
   wrangler tail kivv-mcp | grep "401"

   # Review unusual access patterns
   # Check Cloudflare Analytics for spike in requests
   ```

### Input Validation

All user inputs are sanitized:
- SQL injection prevention (parameterized queries)
- XSS prevention (HTML entity encoding in RSS feeds)
- Rate limiting (10 requests/minute per user)

### HTTPS Enforcement

All Cloudflare Workers use HTTPS by default. No HTTP traffic allowed.

## 💾 Backup Strategy

### Automated Daily Backups

Add to automation worker or create separate backup worker:

```bash
# Create backup script
cat > scripts/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d)
wrangler d1 export kivv-db --output="backups/kivv-db-$DATE.sql"
wrangler r2 object put kivv-backups/db-$DATE.sql --file="backups/kivv-db-$DATE.sql"
echo "Backup completed: kivv-db-$DATE.sql"
EOF

chmod +x scripts/backup.sh

# Run weekly via cron
# 0 0 * * 0 /path/to/kivv/scripts/backup.sh
```

### Manual Backup Before Changes

```bash
# Before major changes, always backup
wrangler d1 export kivv-db --output="backup-before-change-$(date +%Y%m%d).sql"

# Verify backup file
ls -lh backup-before-change-*.sql

# Test restore in development
wrangler d1 execute kivv-db --file=backup-before-change-*.sql --local
```

## 🎯 Production Readiness Checklist

### Infrastructure
- [ ] All Cloudflare resources created (D1, KV, R2)
- [ ] Database schema initialized with correct tables
- [ ] Test data populated (2 users, 11 topics)
- [ ] All secrets configured securely

### Deployment
- [ ] Automation worker deployed and healthy
- [ ] MCP server deployed and healthy
- [ ] Cron triggers configured correctly
- [ ] All endpoints return expected responses

### Testing
- [ ] Health checks pass for both workers
- [ ] API authentication works correctly
- [ ] MCP tools return correct data
- [ ] RSS feeds generate valid XML
- [ ] Manual automation trigger works
- [ ] End-to-end workflow tested

### Monitoring
- [ ] Cloudflare dashboard configured
- [ ] Log streaming tested
- [ ] Cost monitoring set up
- [ ] Alert thresholds configured
- [ ] Backup strategy implemented

### Security
- [ ] Secrets never committed to git
- [ ] API keys rotated and secured
- [ ] HTTPS enforced everywhere
- [ ] Input validation verified
- [ ] Rate limiting tested

### Documentation
- [ ] Deployment guide reviewed
- [ ] Troubleshooting steps documented
- [ ] Monitoring procedures documented
- [ ] Rollback procedures tested
- [ ] Team trained on operations

## 📞 Support & Resources

### Getting Help

1. **Check logs first:**
   ```bash
   wrangler tail kivv-automation
   wrangler tail kivv-mcp
   ```

2. **Review Cloudflare dashboard:**
   - Workers metrics
   - Error rates
   - Recent deployments

3. **Verify configuration:**
   - Database connection
   - API keys
   - Wrangler.toml settings

4. **Test endpoints manually:**
   - Health checks
   - API tools
   - RSS feeds

### Useful Links

- **Cloudflare Dashboard:** https://dash.cloudflare.com
- **Anthropic Console:** https://console.anthropic.com
- **GitHub Repository:** https://github.com/jeffaf/kivv
- **Wrangler Docs:** https://developers.cloudflare.com/workers/wrangler/
- **D1 Documentation:** https://developers.cloudflare.com/d1/

### Contact

For issues or questions:
- **Email:** jeffbarron@protonmail.com
- **GitHub Issues:** https://github.com/jeffaf/kivv/issues

---

**Congratulations! 🎉** Your kivv system is now deployed and production-ready. The automation worker will run daily at 6 AM UTC, and you can access papers via Claude Desktop MCP integration or RSS feeds.

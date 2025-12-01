# kivv Troubleshooting Guide

Quick reference for common issues and solutions.

## 🔍 Quick Diagnostics

### Health Check Commands

```bash
# Check all components at once
curl https://kivv-automation.<username>.workers.dev/health && \
curl https://kivv-mcp.<username>.workers.dev/health && \
wrangler d1 execute kivv-db --command "SELECT 1" && \
echo "All systems operational"

# Check secrets are configured
wrangler secret list --name kivv-automation
# Should show: CLAUDE_API_KEY, CRON_SECRET

# Check database has data
wrangler d1 execute kivv-db --command "
  SELECT
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM topics WHERE enabled=1) as active_topics,
    (SELECT COUNT(*) FROM papers) as total_papers
"
```

## 🚨 Common Issues & Solutions

### Issue: No Papers Being Collected

**Symptoms:**
- Automation runs but no papers appear in database
- Database query returns 0 papers
- RSS feeds are empty

**Diagnosis:**

```bash
# Check automation logs
wrangler tail kivv-automation --format=pretty

# Check topics are enabled
wrangler d1 execute kivv-db --command "
  SELECT id, user_id, topic_name, enabled
  FROM topics
  ORDER BY user_id, id
"

# Check for errors in last run
wrangler kv:key get --namespace-id=7f6b7437931c4c268c27d01a4169101b \
  "checkpoint:automation:$(date +%Y-%m-%d)"
```

**Solutions:**

1. **No enabled topics:**
   ```bash
   # Enable topics for a user
   wrangler d1 execute kivv-db --command "
     UPDATE topics
     SET enabled = 1
     WHERE user_id = 1
   "
   ```

2. **Claude API key not set:**
   ```bash
   cd automation
   wrangler secret put CLAUDE_API_KEY
   # Enter your Anthropic API key
   ```

3. **arXiv API returning no results:**
   - Check topic names are specific enough
   - Verify arXiv search syntax in code
   - Check arXiv API status: https://status.arxiv.org/

4. **Relevance filtering too aggressive:**
   - Review relevance threshold in code
   - Check Claude API logs for scoring

### Issue: MCP Tools Not Working in Claude Desktop

**Symptoms:**
- Claude says "I don't have access to that tool"
- MCP connection shows as disconnected
- Tools timeout or return errors

**Diagnosis:**

```bash
# Test MCP server health
curl https://kivv-mcp.<username>.workers.dev/health

# Test tool directly with curl
export KIVV_API_KEY="your_api_key_from_database"
curl -X POST https://kivv-mcp.<username>.workers.dev/mcp/tools/list_library \
  -H "x-api-key: $KIVV_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'

# Check Claude Desktop config syntax
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool
```

**Solutions:**

1. **Invalid Claude Desktop config:**
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
   - Ensure valid JSON (no trailing commas, proper quotes)
   - Replace `<username>` with your actual subdomain
   - Replace `YOUR_API_KEY` with key from database

2. **Wrong API key:**
   ```bash
   # Get correct API key
   wrangler d1 execute kivv-db --command "
     SELECT username, api_key
     FROM users
     WHERE username = 'jeff'
   "
   # Copy api_key value to Claude Desktop config
   ```

3. **Claude Desktop not restarted:**
   - Close Claude Desktop completely (Cmd+Q on macOS)
   - Reopen Claude Desktop
   - Start new conversation to test

4. **MCP server not responding:**
   ```bash
   # Check deployment status
   wrangler deployments list --name kivv-mcp

   # Redeploy if needed
   cd mcp-server
   wrangler deploy
   ```

### Issue: Authentication Failures (401 Errors)

**Symptoms:**
- API requests return 401 Unauthorized
- Claude Desktop can't connect to MCP
- Curl tests fail with authentication errors

**Diagnosis:**

```bash
# Test with and without API key
curl https://kivv-mcp.<username>.workers.dev/mcp/tools/list_library
# Should return 401

curl -X POST https://kivv-mcp.<username>.workers.dev/mcp/tools/list_library \
  -H "x-api-key: wrong_key" \
  -H "Content-Type: application/json" \
  -d '{}'
# Should return 401

# Check API key in database
wrangler d1 execute kivv-db --command "SELECT username, api_key FROM users"
```

**Solutions:**

1. **API key mismatch:**
   ```bash
   # Verify key in database matches config
   DB_KEY=$(wrangler d1 execute kivv-db --command "SELECT api_key FROM users WHERE username='jeff'" | grep -v "api_key" | tail -1 | tr -d ' ')
   CONFIG_KEY=$(cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | grep api-key | cut -d'"' -f4)

   echo "Database key: $DB_KEY"
   echo "Config key: $CONFIG_KEY"

   # They should match exactly
   ```

2. **Generate new API key:**
   ```bash
   # Generate secure random key
   NEW_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
   echo "New API key: $NEW_KEY"

   # Update database
   wrangler d1 execute kivv-db --command "
     UPDATE users
     SET api_key = '$NEW_KEY'
     WHERE username = 'jeff'
   "

   # Update Claude Desktop config with new key
   ```

3. **Missing authentication header:**
   - Ensure `x-api-key` header is present (lowercase)
   - Check header name matches exactly

### Issue: RSS Feeds Empty or Not Updating

**Symptoms:**
- RSS feed XML shows no items
- Feed reader shows no new papers
- Curl returns valid XML but empty channel

**Diagnosis:**

```bash
# Check papers exist for user
wrangler d1 execute kivv-db --command "
  SELECT COUNT(*) as unexplored_papers
  FROM papers p
  JOIN user_papers up ON p.id = up.paper_id
  JOIN users u ON up.user_id = u.id
  WHERE u.username = 'jeff'
    AND up.explored = 0
"

# Get RSS feed
curl https://kivv-mcp.<username>.workers.dev/feeds/jeff/rss.xml

# Check cache
wrangler kv:key get --namespace-id=7f6b7437931c4c268c27d01a4169101b "rss:jeff"
```

**Solutions:**

1. **No unexplored papers:**
   ```bash
   # Check if all papers marked as explored
   wrangler d1 execute kivv-db --command "
     UPDATE user_papers
     SET explored = 0
     WHERE user_id = (SELECT id FROM users WHERE username = 'jeff')
   "
   ```

2. **Stale cache:**
   ```bash
   # Clear RSS cache
   wrangler kv:key delete --namespace-id=7f6b7437931c4c268c27d01a4169101b "rss:jeff"

   # Regenerate feed
   curl https://kivv-mcp.<username>.workers.dev/feeds/jeff/rss.xml
   ```

3. **Invalid username:**
   ```bash
   # List valid usernames
   wrangler d1 execute kivv-db --command "SELECT username FROM users"

   # Use correct username in URL
   curl https://kivv-mcp.<username>.workers.dev/feeds/CORRECT_USERNAME/rss.xml
   ```

### Issue: Automation Not Running on Schedule

**Symptoms:**
- No papers collected overnight
- Checkpoint not updated
- Cron trigger not firing

**Diagnosis:**

```bash
# Check cron configuration
cat automation/wrangler.toml | grep -A2 "\[triggers\]"

# Check last checkpoint timestamp
wrangler kv:key list --namespace-id=7f6b7437931c4c268c27d01a4169101b --prefix="checkpoint:automation"

# View automation worker logs (wait for next cron time)
wrangler tail kivv-automation --format=pretty
```

**Solutions:**

1. **Cron not configured:**
   ```toml
   # In automation/wrangler.toml, ensure:
   [triggers]
   crons = ["0 6 * * *"]
   ```
   Then redeploy:
   ```bash
   cd automation
   wrangler deploy
   ```

2. **Test manually:**
   ```bash
   # Trigger automation manually
   curl -X POST https://kivv-automation.<username>.workers.dev/run \
     -H "Authorization: Bearer YOUR_CRON_SECRET"

   # Check logs immediately after
   wrangler tail kivv-automation --format=pretty
   ```

3. **Check next scheduled run:**
   - Go to Cloudflare Dashboard
   - Workers & Pages → kivv-automation
   - Triggers tab → view next cron run time
   - Verify cron expression is correct (use https://crontab.guru/)

### Issue: High Claude API Costs

**Symptoms:**
- Claude API bill higher than expected
- Billing alert triggered
- Usage exceeds $10/month

**Diagnosis:**

```bash
# Check papers collected per day
wrangler d1 execute kivv-db --command "
  SELECT DATE(created_at) as date, COUNT(*) as papers
  FROM papers
  GROUP BY DATE(created_at)
  ORDER BY date DESC
  LIMIT 7
"

# Check Claude API usage in Anthropic console
# Go to: https://console.anthropic.com/settings/billing

# Estimate costs:
# Haiku: $0.25 per million input tokens, $1.25 per million output tokens
# Sonnet: $3 per million input tokens, $15 per million output tokens
```

**Solutions:**

1. **Reduce paper collection:**
   ```bash
   # Disable some topics
   wrangler d1 execute kivv-db --command "
     UPDATE topics
     SET enabled = 0
     WHERE topic_name IN ('topic1', 'topic2')
   "

   # Or reduce max_results in arXiv queries (code change)
   ```

2. **Use Haiku model only:**
   - Edit automation code to use only Claude Haiku
   - Trade off: Lower quality summaries, but 90% cost reduction

3. **Implement stricter relevance filtering:**
   - Increase relevance threshold score
   - Reduce false positives before summarization

4. **Change automation frequency:**
   ```toml
   # In automation/wrangler.toml, change to weekly:
   [triggers]
   crons = ["0 6 * * 1"]  # Every Monday at 6 AM UTC
   ```

### Issue: Database Connection Errors

**Symptoms:**
- Workers return 500 errors
- Database queries timeout
- "Database not found" errors

**Diagnosis:**

```bash
# Check database exists
wrangler d1 list | grep kivv-db

# Check database info
wrangler d1 info kivv-db

# Test direct connection
wrangler d1 execute kivv-db --command "SELECT 1"

# Verify wrangler.toml database IDs
grep database_id mcp-server/wrangler.toml
grep database_id automation/wrangler.toml
```

**Solutions:**

1. **Wrong database ID:**
   ```bash
   # Get correct ID
   wrangler d1 list

   # Update wrangler.toml files
   # mcp-server/wrangler.toml and automation/wrangler.toml:
   [[d1_databases]]
   binding = "DB"
   database_name = "kivv-db"
   database_id = "CORRECT_ID_HERE"

   # Redeploy both workers
   cd mcp-server && wrangler deploy
   cd ../automation && wrangler deploy
   ```

2. **Database not initialized:**
   ```bash
   # Check if schema exists
   wrangler d1 execute kivv-db --command "
     SELECT name FROM sqlite_master WHERE type='table'
   "

   # If empty, initialize schema
   wrangler d1 execute kivv-db --file=mcp-server/schema.sql --remote
   ```

3. **Database quota exceeded:**
   ```bash
   # Check database size
   wrangler d1 info kivv-db

   # If approaching 5GB limit, clean old papers
   wrangler d1 execute kivv-db --command "
     DELETE FROM papers
     WHERE created_at < DATE('now', '-90 days')
   "
   ```

### Issue: Deployment Failures

**Symptoms:**
- `wrangler deploy` fails
- Build errors
- Binding errors

**Diagnosis:**

```bash
# Check wrangler authentication
wrangler whoami

# Dry run deployment
wrangler deploy --dry-run

# Check for TypeScript errors
bun run type-check

# View detailed deployment logs
wrangler deploy --verbose
```

**Solutions:**

1. **Authentication issues:**
   ```bash
   # Re-authenticate
   wrangler login

   # Or use API token
   export CLOUDFLARE_API_TOKEN="your_token"
   wrangler whoami
   ```

2. **Build errors:**
   ```bash
   # Fix TypeScript errors first
   bun run type-check

   # Build locally
   bun run build

   # Then deploy
   wrangler deploy
   ```

3. **Binding errors:**
   ```bash
   # Verify all resources exist
   wrangler d1 list | grep kivv-db
   wrangler kv:namespace list | grep KIVV_CACHE
   wrangler r2 bucket list | grep kivv-papers

   # Update wrangler.toml with correct IDs
   # Redeploy
   ```

## 🔧 Advanced Diagnostics

### Full System Health Check

```bash
#!/bin/bash
# Save as scripts/health-check.sh

echo "=== kivv System Health Check ==="
echo ""

echo "1. Worker Health:"
curl -s https://kivv-automation.<username>.workers.dev/health | python3 -m json.tool
curl -s https://kivv-mcp.<username>.workers.dev/health | python3 -m json.tool
echo ""

echo "2. Database Status:"
wrangler d1 execute kivv-db --command "
  SELECT
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM topics WHERE enabled=1) as active_topics,
    (SELECT COUNT(*) FROM papers) as total_papers,
    (SELECT COUNT(*) FROM papers WHERE created_at > DATE('now', '-1 day')) as papers_last_24h
"
echo ""

echo "3. Recent Checkpoints:"
wrangler kv:key list --namespace-id=7f6b7437931c4c268c27d01a4169101b \
  --prefix="checkpoint:automation" | tail -5
echo ""

echo "4. API Authentication Test:"
API_KEY=$(wrangler d1 execute kivv-db --command "SELECT api_key FROM users LIMIT 1" | tail -1 | tr -d ' ')
curl -s -X POST https://kivv-mcp.<username>.workers.dev/mcp/tools/list_library \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 1}' | python3 -m json.tool
echo ""

echo "=== Health Check Complete ==="
```

### Performance Monitoring

```bash
# Monitor request rate
wrangler tail kivv-mcp --format=pretty | grep -E "(GET|POST)" | wc -l

# Check average response time (requires manual calculation from logs)
wrangler tail kivv-mcp --format=pretty | grep "duration_ms"

# Database query performance
wrangler d1 execute kivv-db --command "
  SELECT
    sql,
    COUNT(*) as executions
  FROM sqlite_master
  CROSS JOIN (SELECT 1) -- Dummy join for query log analysis
  GROUP BY sql
  ORDER BY executions DESC
"
# Note: D1 doesn't have query performance logs, monitor via application logs
```

### Log Analysis

```bash
# Find errors in last 100 log entries
wrangler tail kivv-automation --format=pretty > logs.txt &
TAIL_PID=$!
sleep 10
kill $TAIL_PID
cat logs.txt | grep -i error

# Count request types
cat logs.txt | grep -oE "(GET|POST|PUT|DELETE)" | sort | uniq -c

# Find slow requests (>1000ms)
cat logs.txt | grep "duration_ms" | awk '$NF > 1000 {print $0}'
```

## 📞 Getting Help

### Before Asking for Help

1. ✅ Run health check commands
2. ✅ Check Cloudflare dashboard for errors
3. ✅ Review recent deployments
4. ✅ Test endpoints with curl
5. ✅ Check worker logs
6. ✅ Verify database connection
7. ✅ Confirm API keys are set

### Information to Include

When reporting issues, include:

- **Error message:** Full error text from logs
- **Steps to reproduce:** What commands you ran
- **Expected vs actual:** What should happen vs what happened
- **Environment:** Cloudflare worker URL, database ID
- **Recent changes:** Any deployments or config changes
- **Logs:** Relevant log excerpts (use `wrangler tail`)

### Useful Debug Commands

```bash
# Capture full system state
bash scripts/health-check.sh > system-state-$(date +%Y%m%d).txt

# Export recent logs
wrangler tail kivv-mcp --format=pretty > mcp-logs-$(date +%Y%m%d).txt &
sleep 30
kill %1

# Database dump
wrangler d1 export kivv-db --output=db-dump-$(date +%Y%m%d).sql

# Configuration dump
cat mcp-server/wrangler.toml > config-$(date +%Y%m%d).txt
cat automation/wrangler.toml >> config-$(date +%Y%m%d).txt
```

## 🔗 Additional Resources

- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/
- **D1 Database Docs:** https://developers.cloudflare.com/d1/
- **Wrangler CLI Reference:** https://developers.cloudflare.com/workers/wrangler/
- **Claude API Docs:** https://docs.anthropic.com/
- **GitHub Issues:** https://github.com/jeffaf/kivv/issues

---


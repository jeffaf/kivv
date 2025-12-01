# kivv - Quick Answers

## 🔑 Where did the API key come from?

**Answer:** The API key `c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d` was hardcoded in the initial database seed data.

**Location:** `shared/schema.sql` line 127:
```sql
INSERT OR IGNORE INTO users (username, email, api_key, display_name, is_active) VALUES
  ('jeff', 'jeffbarron@protonmail.com', 'c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d', 'Jeff', 1),
  ('wife', 'wife@example.com', 'e98699bedad9746e231843b96150c0638b7cceb717c44d5f9010a272a5b8de5b', 'Wife', 1);
```

**⚠️ CRITICAL:** This key was exposed in git history (CHUNK4-VERIFICATION.md) and MUST be rotated immediately.

---

## 🔄 How do I rotate the API key?

**Quick method:**
```bash
cd /home/gat0r/kivv

# Generate new random key
NEW_KEY=$(openssl rand -hex 32)
echo "New key: $NEW_KEY"

# Update database
npx wrangler d1 execute kivv-db --remote \
  --command "UPDATE users SET api_key = '$NEW_KEY' WHERE username = 'jeff'"

# Save the new key for Claude Desktop config
echo "$NEW_KEY" > ~/kivv-api-key.txt
```

**Automated method:**
```bash
cd /home/gat0r/kivv
./GET-STARTED.sh
```

This script will:
1. Generate a new random API key
2. Update the database
3. Test authentication
4. Generate Claude Desktop config for you

---

## 🧪 How do I test MCP integration?

### Test 1: Health Check (No Auth)
```bash
curl https://kivv-mcp.jeffbarron.workers.dev/health
```
Expected: `{"status":"healthy",...}`

### Test 2: Authentication
```bash
curl -H "x-api-key: YOUR_NEW_KEY" \
  https://kivv-mcp.jeffbarron.workers.dev/mcp/status
```
Expected: `{"authenticated":true,"user":{"username":"jeff",...}}`

### Test 3: List Papers
```bash
curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/list-library \
  -H "x-api-key: YOUR_NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### Test 4: Search Papers
```bash
curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/search-papers \
  -H "x-api-key: YOUR_NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "transformer", "limit": 5}'
```

### Test 5: Claude Desktop Integration

1. **Edit config:** `~/.config/claude/claude_desktop_config.json`
   ```json
   {
     "mcpServers": {
       "kivv": {
         "url": "https://kivv-mcp.jeffbarron.workers.dev/mcp",
         "headers": {
           "x-api-key": "YOUR_NEW_KEY"
         }
       }
     }
   }
   ```

2. **Restart Claude Desktop** (quit completely from menu)

3. **Test in Claude:**
   - "List my research papers"
   - "Search for papers about attention mechanisms"
   - "Mark paper 1 as explored"

---

## 🚀 How do I use kivv?

### Via Claude Desktop (Recommended)

Once configured (see above), you can use natural language:

**List papers:**
```
List my research papers
Show me unexplored papers
Show me bookmarked papers
```

**Search papers:**
```
Search for papers about transformers
Find papers on AI safety
Search for LLM interpretability papers
```

**Mark papers:**
```
Mark paper 1 as explored
Bookmark paper 5
Add note to paper 3: "Interesting approach to RLHF"
```

### Via MCP API Directly

**List library:**
```bash
curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/list-library \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20,
    "offset": 0,
    "explored": false
  }'
```

**Search papers:**
```bash
curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/search-papers \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "attention mechanism",
    "limit": 10
  }'
```

**Mark as explored:**
```bash
curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/mark-explored \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "paper_id": 1,
    "explored": true,
    "bookmarked": true,
    "notes": "Very interesting paper on transformers"
  }'
```

### Via RSS Feed

Add to your RSS reader:
- **RSS 2.0:** https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml
- **Atom 1.0:** https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/atom.xml

Works with: Feedly, Inoreader, NetNewsWire, Reeder, etc.

---

## 📰 Where do I get the RSS feed?

**Your RSS feeds are already live:**

- **RSS 2.0:** https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml
- **Atom 1.0:** https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/atom.xml

**Test in browser:**
```bash
curl https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml
```

**Add to RSS reader:**
1. Open your RSS reader (Feedly, Inoreader, etc.)
2. Click "Add feed" or "Subscribe"
3. Paste URL: `https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml`
4. Papers will appear as new feed items

**RSS feed features:**
- ✅ XML escaping (XSS prevention)
- ✅ Includes title, abstract, authors, arXiv link
- ✅ Published date from arXiv
- ✅ Unique GUID (arxiv_id)
- ✅ Auto-updates when new papers collected

---

## 📚 How do I check if there are summarized papers?

### Method 1: Query Database Directly
```bash
cd /home/gat0r/kivv

# Count total papers
npx wrangler d1 execute kivv-db --remote \
  --command "SELECT COUNT(*) as total FROM papers"

# Count papers with summaries
npx wrangler d1 execute kivv-db --remote \
  --command "SELECT COUNT(*) as with_summary FROM papers WHERE summary IS NOT NULL"

# See recent papers
npx wrangler d1 execute kivv-db --remote \
  --command "SELECT arxiv_id, title, relevance_score, summary FROM papers ORDER BY created_at DESC LIMIT 5"
```

### Method 2: Use MCP API
```bash
curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/list-library \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}' | jq '.papers[] | {arxiv_id, title, summary}'
```

### Method 3: Claude Desktop
```
List my research papers
```

Claude will show you all papers in your library with summaries.

### Method 4: RSS Feed
```bash
curl https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml
```

Papers with summaries will have `<description>` tags containing the AI-generated summary.

---

## ⏰ When will automation run?

**Automatic schedule:** Daily at 6:00 AM UTC

**Check schedule:**
1. Go to https://dash.cloudflare.com
2. Workers & Pages → **kivv-automation**
3. **Triggers** tab
4. Should show: `0 6 * * *`

**Manual trigger:**
```bash
# Get CRON_SECRET from Cloudflare Dashboard
# Workers → kivv-automation → Settings → Variables & Secrets

curl -X POST https://kivv-automation.jeffbarron.workers.dev/run \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**What automation does:**
1. Fetches your enabled topics from database (currently 3 topics for jeff)
2. Searches arXiv for new papers (last 24 hours)
3. Uses Claude Haiku to score relevance (0.0-1.0)
4. Papers scoring ≥0.7 get Claude Sonnet summaries
5. Stores papers and summaries in database
6. Creates RSS feed entries

**Expected results:**
- **Papers found:** 10-50 per day (depends on topics)
- **Papers summarized:** 2-10 per day (only relevant ones)
- **Cost:** ~$0.10-0.30 per day (budget cap: $1.00/day)

---

## 🏥 Health Checks

```bash
# MCP server status
curl https://kivv-mcp.jeffbarron.workers.dev/health

# Automation worker status
curl https://kivv-automation.jeffbarron.workers.dev/health
```

Both should return:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-01T00:00:00.000Z",
  "services": {
    "database": "connected",
    "cache": "connected",
    "storage": "connected"
  },
  "version": "1.0.0"
}
```

---

## 🐛 Troubleshooting

**No papers in library:**
- Automation hasn't run yet (runs daily 6 AM UTC)
- Trigger manually (see "Manual trigger" above)
- Check topics are enabled: `SELECT * FROM topics WHERE enabled = 1`

**Authentication fails:**
- Verify API key is correct (no extra spaces)
- Ensure you rotated the exposed key
- Test with curl first (see "Test 2: Authentication" above)

**MCP not working in Claude Desktop:**
- Restart Claude Desktop COMPLETELY (quit from menu)
- Check config syntax (valid JSON)
- Verify URL includes `/mcp` path

For more detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 📝 Your Current Configuration

**Deployed URLs:**
- MCP Server: https://kivv-mcp.jeffbarron.workers.dev
- Automation: https://kivv-automation.jeffbarron.workers.dev

**Database:**
- Database ID: 1e80f2bf-462d-4d51-8002-a4cf26013933
- KV Namespace ID: 7f6b7437931c4c268c27d01a4169101b
- R2 Bucket: kivv-papers

**Your Account:**
- Username: jeff
- Email: jeffbarron@protonmail.com
- ⚠️ API Key: **MUST BE ROTATED** (exposed in git history)

**Your Topics:**
1. Machine Learning Theory
2. AI Safety & Alignment
3. Large Language Models

---

## 🚀 Quick Start Commands

```bash
# 1. Run complete setup walkthrough
cd /home/gat0r/kivv
./GET-STARTED.sh

# 2. Or do it manually:

# Generate new API key
NEW_KEY=$(openssl rand -hex 32)

# Update database
npx wrangler d1 execute kivv-db --remote \
  --command "UPDATE users SET api_key = '$NEW_KEY' WHERE username = 'jeff'"

# Test authentication
curl -H "x-api-key: $NEW_KEY" \
  https://kivv-mcp.jeffbarron.workers.dev/mcp/status

# Configure Claude Desktop
nano ~/.config/claude/claude_desktop_config.json

# Test RSS feed
curl https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml

# Check papers
npx wrangler d1 execute kivv-db --remote \
  --command "SELECT COUNT(*) FROM papers"
```

---

**Need more help?** See:
- [SETUP.md](SETUP.md) - Full setup guide
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment details

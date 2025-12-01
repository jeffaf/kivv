# kivv Workers - Which One Do I Use?

You have **TWO workers** deployed to Cloudflare:

---

## 🌐 kivv-mcp (MCP Server)

**URL:** https://kivv-mcp.jeffbarron.workers.dev

**Purpose:** This is your **user-facing API** - what you interact with directly.

**What it does:**
- ✅ Handles MCP (Model Context Protocol) requests from Claude Desktop
- ✅ Serves RSS/Atom feeds
- ✅ Provides REST API for listing, searching, and managing papers
- ✅ Authenticates with your API key
- ✅ Returns paper data, summaries, and metadata

**When you use it:**
- 🖥️ **Claude Desktop integration** - This is the URL in your `claude_desktop_config.json`
- 📰 **RSS feeds** - `/feeds/jeff/rss.xml` endpoint
- 🔍 **Direct API calls** - `/mcp/list-library`, `/mcp/search-papers`, etc.
- 🏥 **Health checks** - `/health` endpoint

**Example usage:**
```bash
# Health check
curl https://kivv-mcp.jeffbarron.workers.dev/health

# List papers (requires API key)
curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/list-library \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'

# RSS feed (no auth required)
curl https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml
```

**Claude Desktop config:**
```json
{
  "mcpServers": {
    "kivv": {
      "url": "https://kivv-mcp.jeffbarron.workers.dev/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

---

## ⚙️ kivv-automation (Background Worker)

**URL:** https://kivv-automation.jeffbarron.workers.dev

**Purpose:** This is your **background automation** - runs automatically, you don't interact with it.

**What it does:**
- ⏰ Runs automatically every day at **6:00 AM UTC** (cron trigger)
- 🔍 Searches arXiv for new papers matching your topics
- 🤖 Uses Claude Haiku to score paper relevance (0.0-1.0)
- ✍️ Uses Claude Sonnet to generate summaries (for papers scoring ≥0.7)
- 💾 Stores papers and summaries in database
- 🔄 Creates checkpoints for resumable execution
- 💰 Enforces $1/day budget cap

**When it runs:**
- 🌅 Automatically daily at 6 AM UTC
- 🔧 Manually via `/run` endpoint (requires CRON_SECRET)

**You typically DON'T interact with this directly**, but you can:

**Manual trigger (optional):**
```bash
# Requires CRON_SECRET from Cloudflare Dashboard
curl -X POST https://kivv-automation.jeffbarron.workers.dev/run \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Health check:**
```bash
curl https://kivv-automation.jeffbarron.workers.dev/health
```

**Monitor execution:**
```bash
# View logs
npx wrangler tail kivv-automation

# Check last run in Cloudflare Dashboard:
# Workers → kivv-automation → Metrics
```

---

## 🎯 Quick Summary

| Aspect | kivv-mcp | kivv-automation |
|--------|----------|-----------------|
| **You interact with it** | ✅ YES | ❌ NO |
| **Purpose** | Serve data to you | Collect papers from arXiv |
| **When it runs** | On-demand (when you query) | Daily at 6 AM UTC |
| **Endpoints** | `/mcp/*`, `/feeds/*`, `/health` | `/run`, `/health` |
| **Authentication** | Your API key (x-api-key header) | CRON_SECRET (for manual trigger) |
| **What you use it for** | Claude Desktop, RSS, API calls | Nothing (runs automatically) |
| **Can manually trigger** | N/A (always available) | Yes (via `/run` endpoint) |

---

## 🔄 How They Work Together

```
1. kivv-automation runs at 6 AM UTC
   ├─ Fetches your enabled topics from database
   ├─ Searches arXiv for new papers
   ├─ AI scores relevance (Haiku)
   ├─ AI generates summaries (Sonnet, if relevant)
   └─ Stores papers in database

2. You query kivv-mcp
   ├─ Via Claude Desktop: "List my research papers"
   ├─ Via RSS reader: Fetches /feeds/jeff/rss.xml
   └─ Via API: curl /mcp/list-library

3. kivv-mcp returns papers
   ├─ Queries database for your papers
   ├─ Filters by user_id (data isolation)
   └─ Returns papers with summaries
```

---

## 📍 Which URL Do You Use?

**For Claude Desktop config:** `https://kivv-mcp.jeffbarron.workers.dev/mcp`

**For RSS feed:** `https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml`

**For API calls:** `https://kivv-mcp.jeffbarron.workers.dev/mcp/*`

**For automation:** Nothing (it runs automatically) or `https://kivv-automation.jeffbarron.workers.dev/run` (manual trigger)

---

## 🏥 Health Check Both Workers

```bash
# MCP server (should return healthy)
curl https://kivv-mcp.jeffbarron.workers.dev/health

# Automation worker (should return healthy)
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

## 🚀 Getting Started

**Step 1:** Use **kivv-mcp** for everything you interact with:
```bash
# Configure Claude Desktop
nano ~/.config/claude/claude_desktop_config.json

# Add kivv-mcp URL
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

**Step 2:** Let **kivv-automation** run automatically:
- Runs daily at 6 AM UTC
- No configuration needed
- Check Cloudflare Dashboard → Workers → kivv-automation → Metrics to see last run

**Step 3:** Optionally monitor automation:
```bash
# View live logs
npx wrangler tail kivv-automation
```

---

## 💡 Pro Tips

**If no papers showing up:**
- Automation hasn't run yet (runs at 6 AM UTC)
- Manually trigger: `curl -X POST https://kivv-automation.jeffbarron.workers.dev/run -H "Authorization: Bearer CRON_SECRET"`
- Check topics are enabled: `SELECT * FROM topics WHERE enabled = 1`

**To check automation status:**
- Cloudflare Dashboard → Workers → kivv-automation → Metrics
- Look for "Cron Invocations"
- Check "Errors" count (should be 0)

**To view collected papers:**
- Claude Desktop: "List my research papers"
- RSS feed: https://kivv-mcp.jeffbarron.workers.dev/feeds/jeff/rss.xml
- API: `curl -X POST https://kivv-mcp.jeffbarron.workers.dev/mcp/list-library -H "x-api-key: KEY" -H "Content-Type: application/json" -d '{"limit":10}'`

---

**Bottom line:** Use **kivv-mcp** for everything. **kivv-automation** works in the background automatically.

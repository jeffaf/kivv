# kivv Setup Guide

## ✅ Your workers are already deployed!

GitHub Actions has automatically deployed both workers to Cloudflare. Here's how to complete the setup.

---

## 🔍 Step 1: Get Your Deployment URLs

Visit your Cloudflare dashboard to find your worker URLs:

1. Go to https://dash.cloudflare.com
2. Click **Workers & Pages**
3. You should see:
   - **kivv-mcp** - Your MCP server
   - **kivv-automation** - Your daily automation worker

Click on each to get the full URL (format: `https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev`)

---

## 🔑 Step 2: Get Your API Key

Your database was seeded with 2 users (jeff + wife) during initial setup. Get your API key:

```bash
# Option 1: Query database directly (requires wrangler installed locally)
cd /home/gat0r/kivv
npx wrangler d1 execute kivv-db --remote \
  --command "SELECT username, api_key FROM users WHERE username = 'jeff'"

# Option 2: Use Claude Desktop MCP after setup (see Step 3)
```

**⚠️ SECURITY WARNING:**
The API key `c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d` was exposed in git history (CHUNK4-VERIFICATION.md).

**REQUIRED ACTION: Rotate this key immediately:**
```bash
# Generate new API key
NEW_KEY=$(openssl rand -hex 32)
echo "New API key: $NEW_KEY"

# Update database
npx wrangler d1 execute kivv-db --remote \
  --command "UPDATE users SET api_key = '$NEW_KEY' WHERE username = 'jeff'"
```

---

## 🖥️ Step 3: Configure Claude Desktop

Edit your Claude Desktop config file:

**Linux/WSL:**
```bash
nano ~/.config/claude/claude_desktop_config.json
```

**macOS:**
```bash
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Add this configuration** (replace placeholders):
```json
{
  "mcpServers": {
    "kivv": {
      "url": "https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev/mcp",
      "headers": {
        "x-api-key": "YOUR_NEW_API_KEY_FROM_STEP_2"
      }
    }
  }
}
```

**Save and restart Claude Desktop.**

---

## ✅ Step 4: Test Your Setup

### Test 1: Health Check

```bash
# Test MCP server
curl https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev/health

# Test automation worker
curl https://kivv-automation.YOUR_SUBDOMAIN.workers.dev/health
```

Both should return `{"status":"healthy",...}`

### Test 2: MCP Authentication

```bash
curl -H "x-api-key: YOUR_API_KEY" \
  https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev/mcp/status
```

Should return: `{"authenticated":true,"user":{"username":"jeff",...}}`

### Test 3: Claude Desktop MCP

Open Claude Desktop and try:
```
List my research papers using kivv MCP
```

You should see a response listing papers from your library (may be empty if automation hasn't run yet).

---

## 📅 Step 5: Trigger First Automation Run (Optional)

The automation runs automatically daily at 6 AM UTC. To trigger it manually:

```bash
# Get your CRON_SECRET from Cloudflare
# Dashboard → Workers → kivv-automation → Settings → Variables & Secrets

curl -X POST https://kivv-automation.YOUR_SUBDOMAIN.workers.dev/run \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

This will:
1. Fetch your enabled topics from database
2. Search arXiv for papers (last 24 hours)
3. Use AI to filter and summarize relevant papers
4. Store them in your library

**Note:** First run may take 1-2 minutes depending on how many papers match your topics.

---

## 📊 Step 6: Monitor Your System

### View Logs

```bash
# MCP server logs (requires wrangler installed locally)
npx wrangler tail kivv-mcp

# Automation worker logs
npx wrangler tail kivv-automation
```

### Check Cron Schedule

1. Go to https://dash.cloudflare.com
2. Workers & Pages → **kivv-automation**
3. **Triggers** tab
4. Verify cron shows: `0 6 * * *` (daily at 6 AM UTC)

### View Metrics

Same dashboard location, **Metrics** tab shows:
- Request count
- Error rate
- CPU time
- Cost estimate

---

## 📁 Step 7: Access Your RSS Feed

```bash
# Get your RSS feed URL
https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev/feeds/jeff/rss.xml

# Or Atom feed
https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev/feeds/jeff/atom.xml
```

Add this URL to any RSS reader (Feedly, Inoreader, NetNewsWire, etc.)

---

## 🔧 Troubleshooting

### "No papers in library"
- Automation hasn't run yet (runs daily at 6 AM UTC)
- Trigger manually (see Step 5)
- Check if your topics are enabled: `SELECT * FROM topics WHERE enabled = 1`

### "Authentication failed"
- Verify API key is correct (check for extra spaces)
- Ensure you rotated the exposed key (see Step 2 security warning)
- Test with curl first (see Step 4)

### "MCP tools not showing in Claude Desktop"
- Restart Claude Desktop completely (quit from menu bar)
- Check config file syntax (valid JSON)
- Verify MCP server URL is correct (include `/mcp` path)

### "Worker deployment failed"
- Check GitHub Actions: https://github.com/jeffaf/kivv/actions
- Verify secrets are set correctly in GitHub repo settings
- Check Cloudflare dashboard for error messages

For more detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 💰 Cost Monitoring

Expected monthly costs for 2 users with 11 topics:

- **Cloudflare Workers:** FREE (within 100k req/day limit)
- **Cloudflare D1:** FREE (within 5GB limit)
- **Cloudflare KV:** FREE (within 100k ops/day limit)
- **Cloudflare R2:** FREE (within 10GB limit)
- **Claude API:** ~$3-9/month (depends on paper volume)

**Total: ~$6/month** (mostly Claude API)

Monitor in:
- Cloudflare Dashboard → Workers → Metrics
- Anthropic Console: https://console.anthropic.com

---

## 🎯 What's Next?

1. ✅ Rotate exposed API key (Step 2)
2. ✅ Configure Claude Desktop (Step 3)
3. ✅ Test MCP integration (Step 4)
4. ⏳ Wait for first automation run (6 AM UTC) or trigger manually
5. 📰 Add RSS feed to your reader (Step 7)
6. 🔍 Explore papers in Claude: "Search for papers about transformers"
7. 📌 Bookmark interesting papers: "Mark paper 123 as bookmarked"

---

## 📚 Documentation

- [QUICKSTART.md](QUICKSTART.md) - Initial deployment guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Detailed deployment procedures
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [PRODUCTION-READY.md](PRODUCTION-READY.md) - Certification checklist

---

**🎉 You're all set!** Your personal arXiv research assistant is running and will start collecting papers daily.

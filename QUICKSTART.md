# kivv Quick Start Guide

## First Time Deployment (Choose ONE)

### Option 1: Automated Script (Easiest)
```bash
cd /home/gat0r/kivv
./scripts/deploy.sh
```
The script will guide you through:
- Prerequisites check
- Secret configuration
- Worker deployment
- Health verification

### Option 2: GitHub Actions (Recommended for CI/CD)

**One-time setup:**
1. Go to https://github.com/jeffaf/kivv/settings/secrets/actions
2. Add these secrets:
   ```
   CLOUDFLARE_API_TOKEN     # Get from: dash.cloudflare.com → My Profile → API Tokens
   CLOUDFLARE_ACCOUNT_ID    # Get from: dash.cloudflare.com → Workers → Account ID
   CLAUDE_API_KEY           # Get from: console.anthropic.com
   ```

**Then deploy:**
```bash
git push origin main
```

GitHub Actions will automatically test and deploy both workers.

### Option 3: Manual Deployment

**Set secrets:**
```bash
cd automation
wrangler secret put CLAUDE_API_KEY
wrangler secret put CRON_SECRET
```

**Deploy:**
```bash
# Deploy automation worker
wrangler deploy

# Deploy MCP server
cd ../mcp-server
wrangler deploy
```

**Verify:**
```bash
cd ..
./scripts/health-check.sh
```

## After Deployment

### 1. Configure Claude Desktop

Edit `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "kivv": {
      "url": "https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

Get your API key from database:
```bash
wrangler d1 execute kivv-db --command "SELECT username, api_key FROM users"
```

### 2. Verify Everything Works

**Check health:**
```bash
./scripts/health-check.sh
```

**Test RSS feed:**
```bash
curl https://kivv-mcp.YOUR_SUBDOMAIN.workers.dev/feeds/jeff/rss.xml
```

**Trigger automation manually:**
```bash
curl -X POST https://kivv-automation.YOUR_SUBDOMAIN.workers.dev/run \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 3. Monitor First Cron Run

The automation runs daily at 6 AM UTC. Check Cloudflare dashboard:
1. Go to https://dash.cloudflare.com
2. Workers & Pages → kivv-automation
3. Metrics → See cron execution
4. Logs → Check for any errors

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

## Full Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Complete deployment guide
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Issue resolution
- [PRODUCTION-READY.md](PRODUCTION-READY.md) - Certification checklist
- [README.md](README.md) - Project overview

## Cost Monitoring

Expected monthly costs for 2 users:
- Cloudflare Workers: **FREE** (within 100k req/day limit)
- Cloudflare D1: **FREE** (within 5GB limit)
- Cloudflare KV: **FREE** (within 100k ops/day limit)
- Cloudflare R2: **FREE** (within 10GB limit)
- Claude API: **$3-9/month** (depends on paper volume)

**Total: ~$6/month**

Monitor costs in Cloudflare dashboard and Anthropic console.

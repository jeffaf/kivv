# kivv Setup Checklist

This checklist guides you through setting up the kivv arXiv Research Assistant system.

## 1. Required API Keys (Immediate Action)

### Cloudflare API Token
- **Where:** https://dash.cloudflare.com/profile/api-tokens
- **Action:** Create token with "Edit Cloudflare Workers" template
- **Required Permissions:**
  - Account > Workers Scripts > Edit
  - Account > Account Settings > Read
  - Account > D1 > Edit
  - Account > R2 > Edit
- **Set in:** `.env` as `CLOUDFLARE_API_TOKEN`

### Cloudflare Account ID
- **Where:** https://dash.cloudflare.com/ (right sidebar under "Account ID")
- **Action:** Copy your account ID
- **Set in:** `.env` as `CLOUDFLARE_ACCOUNT_ID`

### Claude API Key
- **Where:** https://console.anthropic.com/settings/keys
- **Action:** Create new API key
- **Cost:** ~$3/month for 2 users (20-40 papers/day)
- **Set in:** `.env` as `CLAUDE_API_KEY`

## 2. Cloudflare Resources (Create During Setup)

These will be generated when you run setup commands:

### D1 Database
```bash
wrangler d1 create kivv-db
# Copy the database_id from output
```
**Set in:** `mcp-server/wrangler.toml` and `automation/wrangler.toml`

### R2 Bucket
```bash
wrangler r2 bucket create kivv-papers
```
**Already configured in:** `wrangler.toml` files

### KV Namespace
```bash
wrangler kv:namespace create "KIVV_CACHE"
# Copy the id from output
```
**Set in:** `mcp-server/wrangler.toml` and `automation/wrangler.toml`

## 3. User API Keys (Generate Securely)

Generate random secure keys for MCP authentication:

```bash
# Generate for user 1 (Jeff)
node -e "console.log('MCP_API_KEY_JEFF=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate for user 2 (Wife)
node -e "console.log('MCP_API_KEY_WIFE=' + require('crypto').randomBytes(32).toString('hex'))"
```

**Set in:** `.env` files

## 4. GitHub Secrets (For Automated Deployment)

Go to: https://github.com/jeffaf/kivv/settings/secrets/actions

Add these repository secrets:
- `CLOUDFLARE_API_TOKEN` (from step 1)
- `CLOUDFLARE_ACCOUNT_ID` (from step 1)
- `CLAUDE_API_KEY` (from step 1)
- `D1_DATABASE_ID` (from step 2)

## 5. Local Environment Setup

```bash
# Clone repository
git clone https://github.com/jeffaf/kivv.git
cd kivv

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys from steps 1-3
nano .env
```

## 6. Deploy to Cloudflare

```bash
# Create D1 database (if not done in step 2)
wrangler d1 create kivv-db

# Create R2 bucket
wrangler r2 bucket create kivv-papers

# Create KV namespace
wrangler kv:namespace create "KIVV_CACHE"

# Update wrangler.toml files with IDs from above

# Deploy MCP server
cd mcp-server
wrangler deploy

# Deploy automation worker
cd ../automation
wrangler deploy
```

## 7. Configure Claude Desktop

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "kivv": {
      "url": "https://kivv-mcp.your-subdomain.workers.dev",
      "apiKey": "your_mcp_api_key_here"
    }
  }
}
```

Replace with your actual Worker URL and MCP API key.

## 8. Verify Setup

```bash
# Test MCP server health
curl https://kivv-mcp.your-subdomain.workers.dev/health

# Test automation worker
curl https://kivv-automation.your-subdomain.workers.dev/health

# Check database
wrangler d1 execute kivv-db --command="SELECT 1"
```

## 9. Initial Data Setup

You'll need to populate the database with:
- User accounts
- Initial research topics
- Configuration settings

This will be part of the implementation phase.

## Status Tracking

- [ ] Obtained Cloudflare API Token
- [ ] Obtained Cloudflare Account ID
- [ ] Obtained Claude API Key
- [ ] Created D1 Database
- [ ] Created R2 Bucket
- [ ] Created KV Namespace
- [ ] Generated MCP User API Keys
- [ ] Configured GitHub Secrets
- [ ] Set up local environment (.env)
- [ ] Deployed MCP server
- [ ] Deployed automation worker
- [ ] Configured Claude Desktop
- [ ] Verified all endpoints working
- [ ] Populated initial database data

## Next Steps

After completing this checklist:
1. Review [docs/api.md](docs/api.md) for API documentation
2. See [docs/deployment.md](docs/deployment.md) for ongoing deployment
3. Start implementing MCP server functionality per PRD

## Support

For issues or questions:
- **Email:** jeffbarron@protonmail.com
- **Repository:** https://github.com/jeffaf/kivv
- **Documentation:** See `docs/` directory

# kivv Setup Guide

## Required API Keys

### 1. Cloudflare API Token

**Where to get it:**
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template
4. Or create custom token with permissions:
   - Account > Workers Scripts > Edit
   - Account > Account Settings > Read
   - Account > D1 > Edit
   - Account > R2 > Edit

**Set in:** `CLOUDFLARE_API_TOKEN`

### 2. Cloudflare Account ID

**Where to get it:**
1. Go to https://dash.cloudflare.com/
2. Select any domain/account
3. Look in the right sidebar under "Account ID"
4. Or find in URL: `dash.cloudflare.com/{account_id}/`

**Set in:** `CLOUDFLARE_ACCOUNT_ID`

### 3. Claude API Key

**Where to get it:**
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Go to Settings > API Keys
4. Click "Create Key"
5. Copy the key (starts with `sk-ant-`)

**Cost:** ~$3/month for 2 users with 20-40 papers/day

**Set in:** `CLAUDE_API_KEY`

### 4. D1 Database ID

**Where to get it:**
1. Run: `wrangler d1 create kivv-db`
2. Copy the database ID from output
3. Or list databases: `wrangler d1 list`

**Set in:** `D1_DATABASE_ID`

### 5. MCP User API Keys

**Generate secure keys:**
```bash
# Generate random API keys for each user
node -e "console.log('MCP_API_KEY_JEFF=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('MCP_API_KEY_WIFE=' + require('crypto').randomBytes(32).toString('hex'))"
```

**Set in:** `MCP_API_KEY_JEFF`, `MCP_API_KEY_WIFE`

## GitHub Secrets (for CI/CD)

Add these secrets to GitHub repo settings for automated deployments:

1. Go to https://github.com/jeffaf/kivv/settings/secrets/actions
2. Add these secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLAUDE_API_KEY`
   - `D1_DATABASE_ID`

## Setup Steps

### 1. Clone Repository

```bash
git clone https://github.com/jeffaf/kivv.git
cd kivv
```

### 2. Install Dependencies

```bash
# Install globally if needed
npm install -g wrangler

# Install project dependencies
npm install
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env
```

### 4. Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create kivv-db
# Copy the database_id from output to .env as D1_DATABASE_ID

# Create R2 bucket for PDFs
wrangler r2 bucket create kivv-papers

# Create KV namespace for caching
wrangler kv:namespace create "KIVV_CACHE"
```

### 5. Initialize Database Schema

```bash
cd mcp-server
wrangler d1 execute kivv-db --file=./schema.sql --remote
```

### 6. Deploy Components

```bash
# Deploy MCP server
cd mcp-server
wrangler deploy

# Deploy automation worker
cd ../automation
wrangler deploy
```

### 7. Configure Claude Desktop

Add to your Claude Desktop MCP settings (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

## Verification

### Test MCP Server

```bash
curl https://kivv-mcp.your-subdomain.workers.dev/health
```

Should return: `{"status":"ok"}`

### Test Automation

```bash
# Trigger manual run (if configured)
curl -X POST https://kivv-automation.your-subdomain.workers.dev/run
```

### Check Database

```bash
wrangler d1 execute kivv-db --command="SELECT * FROM users"
```

## Troubleshooting

### Database Connection Issues

```bash
# Verify database exists
wrangler d1 list

# Check database info
wrangler d1 info kivv-db
```

### Worker Deployment Issues

```bash
# Check worker status
wrangler whoami
wrangler deployments list

# View worker logs
wrangler tail kivv-mcp
```

### MCP Integration Issues

1. Verify Claude Desktop config syntax (must be valid JSON)
2. Check worker URL is accessible
3. Verify API key matches .env configuration
4. Restart Claude Desktop

## Next Steps

After setup is complete:

1. Configure your research topics in the database
2. Test paper discovery with manual automation run
3. Verify MCP integration in Claude Desktop
4. Set up monitoring and alerts (optional)

For deployment details, see [deployment.md](deployment.md).

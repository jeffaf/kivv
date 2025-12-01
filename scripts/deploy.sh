#!/bin/bash
# kivv Production Deployment Script
# Usage: ./scripts/deploy.sh

set -e  # Exit on error

echo "=================================================="
echo "  kivv Production Deployment Script"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check bun
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Bun not found. Install from https://bun.sh${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Bun installed: $(bun --version)${NC}"

# Check wrangler
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler not found. Installing...${NC}"
    bun install -g wrangler
fi
echo -e "${GREEN}✅ Wrangler installed: $(wrangler --version)${NC}"

# Check authentication
if ! wrangler whoami &> /dev/null; then
    echo -e "${RED}❌ Not authenticated with Cloudflare${NC}"
    echo "Run: wrangler login"
    exit 1
fi
echo -e "${GREEN}✅ Authenticated with Cloudflare${NC}"
echo ""

# Verify infrastructure
echo "🏗️  Verifying infrastructure..."

if ! wrangler d1 list | grep -q "kivv-db"; then
    echo -e "${RED}❌ Database 'kivv-db' not found${NC}"
    echo "Create database first:"
    echo "  wrangler d1 create kivv-db"
    exit 1
fi
echo -e "${GREEN}✅ Database exists${NC}"

if ! wrangler kv:namespace list | grep -q "KIVV_CACHE"; then
    echo -e "${YELLOW}⚠️  KV namespace 'KIVV_CACHE' not found${NC}"
    echo "Create KV namespace:"
    echo "  wrangler kv:namespace create KIVV_CACHE"
fi

if ! wrangler r2 bucket list | grep -q "kivv-papers"; then
    echo -e "${YELLOW}⚠️  R2 bucket 'kivv-papers' not found${NC}"
    echo "Create R2 bucket:"
    echo "  wrangler r2 bucket create kivv-papers"
fi
echo ""

# Check secrets
echo "🔐 Checking secrets..."

cd automation

if ! wrangler secret list | grep -q "CLAUDE_API_KEY"; then
    echo -e "${YELLOW}⚠️  CLAUDE_API_KEY not set${NC}"
    echo ""
    echo "Please set your Claude API key:"
    wrangler secret put CLAUDE_API_KEY
fi

if ! wrangler secret list | grep -q "CRON_SECRET"; then
    echo -e "${YELLOW}⚠️  CRON_SECRET not set (optional)${NC}"
    read -p "Set CRON_SECRET for manual triggers? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Generating random secret..."
        SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        echo "$SECRET" | wrangler secret put CRON_SECRET
        echo -e "${GREEN}✅ CRON_SECRET set to: $SECRET${NC}"
        echo "Save this secret for manual triggers!"
    fi
fi

cd ..
echo ""

# Deploy automation worker
echo "🚀 Deploying automation worker..."
cd automation

if wrangler deploy; then
    echo -e "${GREEN}✅ Automation worker deployed${NC}"
    AUTOMATION_URL=$(wrangler deployments list --json | head -1 | grep -o 'https://[^"]*' | head -1 || echo "https://kivv-automation.<username>.workers.dev")
    echo "   URL: $AUTOMATION_URL"
else
    echo -e "${RED}❌ Automation worker deployment failed${NC}"
    exit 1
fi

cd ..
echo ""

# Deploy MCP server
echo "🚀 Deploying MCP server..."
cd mcp-server

if wrangler deploy; then
    echo -e "${GREEN}✅ MCP server deployed${NC}"
    MCP_URL=$(wrangler deployments list --json | head -1 | grep -o 'https://[^"]*' | head -1 || echo "https://kivv-mcp.<username>.workers.dev")
    echo "   URL: $MCP_URL"
else
    echo -e "${RED}❌ MCP server deployment failed${NC}"
    exit 1
fi

cd ..
echo ""

# Verify deployments
echo "✅ Verifying deployments..."

echo "Testing automation worker health..."
if curl -sf "${AUTOMATION_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Automation worker healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Automation worker health check failed${NC}"
fi

echo "Testing MCP server health..."
if curl -sf "${MCP_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ MCP server healthy${NC}"
else
    echo -e "${YELLOW}⚠️  MCP server health check failed${NC}"
fi
echo ""

# Get API key for Claude Desktop config
echo "🔑 Retrieving API key for Claude Desktop..."
API_KEY=$(wrangler d1 execute kivv-db --command "SELECT api_key FROM users LIMIT 1" 2>/dev/null | tail -1 | tr -d ' ' || echo "<API_KEY_FROM_DATABASE>")

# Generate Claude Desktop config
echo "=================================================="
echo "  🎉 Deployment Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Configure Claude Desktop"
echo "   File: ~/.config/claude/claude_desktop_config.json"
echo "   (macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)"
echo ""
echo "   Add this configuration:"
echo ""
echo '   {
     "mcpServers": {
       "kivv": {
         "url": "'"$MCP_URL"'/mcp",
         "headers": {
           "x-api-key": "'"$API_KEY"'"
         }
       }
     }
   }'
echo ""
echo "2. Restart Claude Desktop"
echo ""
echo "3. Test in Claude:"
echo '   Type: "List my research papers using kivv MCP"'
echo ""
echo "4. Monitor deployment:"
echo "   Automation logs: wrangler tail kivv-automation"
echo "   MCP logs: wrangler tail kivv-mcp"
echo ""
echo "5. Verify cron schedule:"
echo "   Go to: https://dash.cloudflare.com"
echo "   Workers → kivv-automation → Triggers"
echo "   Should show: 0 6 * * * (daily at 6 AM UTC)"
echo ""
echo "For troubleshooting, see: TROUBLESHOOTING.md"
echo "For full documentation, see: DEPLOYMENT.md"
echo ""
echo "=================================================="
echo -e "${GREEN}✅ Ready to use!${NC}"
echo "=================================================="

#!/bin/bash
# kivv System Health Check Script
# Usage: ./scripts/health-check.sh

set -e

echo "=================================================="
echo "  kivv System Health Check"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Get worker URLs from user
read -p "Enter automation worker URL (or press Enter for default): " AUTOMATION_URL
AUTOMATION_URL=${AUTOMATION_URL:-"https://kivv-automation.<username>.workers.dev"}

read -p "Enter MCP server URL (or press Enter for default): " MCP_URL
MCP_URL=${MCP_URL:-"https://kivv-mcp.<username>.workers.dev"}

echo ""

# Check automation worker
echo "🔍 Checking automation worker..."
if curl -sf "$AUTOMATION_URL/health" > /dev/null 2>&1; then
    HEALTH=$(curl -s "$AUTOMATION_URL/health")
    echo -e "${GREEN}✅ Automation worker healthy${NC}"
    echo "   Response: $HEALTH"
else
    echo -e "${RED}❌ Automation worker not responding${NC}"
    echo "   URL: $AUTOMATION_URL"
fi
echo ""

# Check MCP server
echo "🔍 Checking MCP server..."
if curl -sf "$MCP_URL/health" > /dev/null 2>&1; then
    HEALTH=$(curl -s "$MCP_URL/health")
    echo -e "${GREEN}✅ MCP server healthy${NC}"
    echo "   Response: $HEALTH"
else
    echo -e "${RED}❌ MCP server not responding${NC}"
    echo "   URL: $MCP_URL"
fi
echo ""

# Check database
echo "🔍 Checking database..."
if wrangler d1 execute kivv-db --command "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database connection successful${NC}"

    # Get database stats
    STATS=$(wrangler d1 execute kivv-db --command "
        SELECT
            (SELECT COUNT(*) FROM users) as users,
            (SELECT COUNT(*) FROM topics WHERE enabled=1) as active_topics,
            (SELECT COUNT(*) FROM papers) as total_papers,
            (SELECT COUNT(*) FROM papers WHERE created_at > datetime('now', '-1 day')) as papers_last_24h
    " 2>/dev/null || echo "Error")

    echo "   Database statistics:"
    echo "$STATS" | tail -1 | awk '{
        print "   - Users: " $1
        print "   - Active topics: " $2
        print "   - Total papers: " $3
        print "   - Papers (last 24h): " $4
    }'
else
    echo -e "${RED}❌ Database connection failed${NC}"
fi
echo ""

# Check KV namespace
echo "🔍 Checking KV namespace..."
if wrangler kv:key list --namespace-id=7f6b7437931c4c268c27d01a4169101b > /dev/null 2>&1; then
    echo -e "${GREEN}✅ KV namespace accessible${NC}"

    # Count checkpoints
    CHECKPOINTS=$(wrangler kv:key list --namespace-id=7f6b7437931c4c268c27d01a4169101b --prefix="checkpoint:" 2>/dev/null | grep -c "name" || echo "0")
    echo "   - Checkpoints: $CHECKPOINTS"
else
    echo -e "${RED}❌ KV namespace not accessible${NC}"
fi
echo ""

# Check R2 bucket
echo "🔍 Checking R2 bucket..."
if wrangler r2 bucket list | grep -q "kivv-papers"; then
    echo -e "${GREEN}✅ R2 bucket exists${NC}"
else
    echo -e "${YELLOW}⚠️  R2 bucket not found${NC}"
fi
echo ""

# Check secrets
echo "🔍 Checking secrets..."
cd automation
if wrangler secret list | grep -q "CLAUDE_API_KEY"; then
    echo -e "${GREEN}✅ CLAUDE_API_KEY set${NC}"
else
    echo -e "${RED}❌ CLAUDE_API_KEY not set${NC}"
fi

if wrangler secret list | grep -q "CRON_SECRET"; then
    echo -e "${GREEN}✅ CRON_SECRET set${NC}"
else
    echo -e "${YELLOW}⚠️  CRON_SECRET not set (optional)${NC}"
fi
cd ..
echo ""

# Test API authentication
echo "🔍 Testing API authentication..."
API_KEY=$(wrangler d1 execute kivv-db --command "SELECT api_key FROM users LIMIT 1" 2>/dev/null | tail -1 | tr -d ' ' || echo "")

if [ -n "$API_KEY" ]; then
    if curl -sf -X POST "$MCP_URL/mcp/tools/list_library" \
        -H "x-api-key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"limit": 1}' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API authentication working${NC}"
    else
        echo -e "${RED}❌ API authentication failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Could not retrieve API key from database${NC}"
fi
echo ""

# Check recent checkpoints
echo "🔍 Checking recent automation runs..."
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d 2>/dev/null || echo "unknown")

if CHECKPOINT=$(wrangler kv:key get --namespace-id=7f6b7437931c4c268c27d01a4169101b "checkpoint:automation:$TODAY" 2>/dev/null); then
    echo -e "${GREEN}✅ Automation ran today${NC}"
    echo "   Checkpoint: $CHECKPOINT"
elif CHECKPOINT=$(wrangler kv:key get --namespace-id=7f6b7437931c4c268c27d01a4169101b "checkpoint:automation:$YESTERDAY" 2>/dev/null); then
    echo -e "${YELLOW}⚠️  No automation run today, last run yesterday${NC}"
    echo "   Checkpoint: $CHECKPOINT"
else
    echo -e "${YELLOW}⚠️  No recent automation runs found${NC}"
fi
echo ""

# Summary
echo "=================================================="
echo "  Health Check Summary"
echo "=================================================="
echo ""
echo "For detailed troubleshooting, see: TROUBLESHOOTING.md"
echo "For monitoring setup, see: DEPLOYMENT.md"
echo ""
echo "To view real-time logs:"
echo "  wrangler tail kivv-automation --format=pretty"
echo "  wrangler tail kivv-mcp --format=pretty"
echo ""
echo "To manually trigger automation:"
echo "  curl -X POST $AUTOMATION_URL/run \\"
echo "    -H \"Authorization: Bearer YOUR_CRON_SECRET\""
echo ""

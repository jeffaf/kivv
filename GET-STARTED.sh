#!/bin/bash
# =============================================================================
# kivv - Complete Setup Walkthrough
# =============================================================================
# This script guides you through rotating your API key, testing MCP, and using kivv.
# Run this step-by-step (copy-paste each section).
# =============================================================================

set -e

echo "==================================================="
echo "  kivv - Post-Deployment Setup Walkthrough"
echo "==================================================="
echo ""
echo "✅ Your workers are ALREADY deployed!"
echo "   - MCP Server: https://kivv-mcp.jeffbarron.workers.dev"
echo "   - Automation: https://kivv-automation.jeffbarron.workers.dev"
echo ""
echo "==================================================="
echo ""

# =============================================================================
# STEP 1: Check if wrangler is installed
# =============================================================================

echo "📋 STEP 1: Checking prerequisites..."
echo ""

if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler not found. Installing..."
    npm install -g wrangler
    echo "✅ Wrangler installed"
else
    echo "✅ Wrangler already installed: $(wrangler --version)"
fi

echo ""
echo "Authenticating with Cloudflare..."
if ! wrangler whoami &> /dev/null; then
    echo "⚠️  Not logged in to Cloudflare"
    echo "Run: wrangler login"
    exit 1
fi
echo "✅ Authenticated with Cloudflare"
echo ""

# =============================================================================
# STEP 2: Rotate the exposed API key
# =============================================================================

echo "==================================================="
echo "🔐 STEP 2: ROTATE EXPOSED API KEY (CRITICAL!)"
echo "==================================================="
echo ""
echo "The API key 'c3c74bbeba60635cf12a6b27e766c8b953fcd70ac4e4347f05d8bc68902d2f1d'"
echo "was exposed in git history and MUST be changed."
echo ""
read -p "Press ENTER to generate a new API key..."

# Generate new random API key
NEW_KEY=$(openssl rand -hex 32)

echo ""
echo "✅ Generated new API key: $NEW_KEY"
echo ""
echo "Updating database..."

# Update database with new key
wrangler d1 execute kivv-db --remote \
  --command "UPDATE users SET api_key = '$NEW_KEY' WHERE username = 'jeff'"

echo "✅ API key rotated successfully!"
echo ""
echo "⚠️  SAVE THIS KEY - You'll need it for Claude Desktop config:"
echo ""
echo "    $NEW_KEY"
echo ""
read -p "Press ENTER when you've saved the key..."

# =============================================================================
# STEP 3: Test the deployment
# =============================================================================

echo ""
echo "==================================================="
echo "✅ STEP 3: Testing Deployment"
echo "==================================================="
echo ""

MCP_URL="https://kivv-mcp.jeffbarron.workers.dev"
AUTOMATION_URL="https://kivv-automation.jeffbarron.workers.dev"

echo "Testing MCP server health..."
curl -s "$MCP_URL/health" | jq '.'
echo ""

echo "Testing automation worker health..."
curl -s "$AUTOMATION_URL/health" | jq '.'
echo ""

echo "Testing MCP authentication with new key..."
AUTH_RESPONSE=$(curl -s -H "x-api-key: $NEW_KEY" "$MCP_URL/mcp/status")
echo "$AUTH_RESPONSE" | jq '.'

if echo "$AUTH_RESPONSE" | grep -q '"authenticated":true'; then
    echo "✅ Authentication successful!"
else
    echo "❌ Authentication failed. Check your API key."
    exit 1
fi

# =============================================================================
# STEP 4: Check current database state
# =============================================================================

echo ""
echo "==================================================="
echo "📊 STEP 4: Checking Database State"
echo "==================================================="
echo ""

echo "Current users in database:"
wrangler d1 execute kivv-db --remote \
  --command "SELECT id, username, email, display_name, is_active FROM users"
echo ""

echo "Current topics for jeff (user_id=1):"
wrangler d1 execute kivv-db --remote \
  --command "SELECT id, topic_name, enabled FROM topics WHERE user_id = 1"
echo ""

echo "Papers collected so far:"
PAPER_COUNT=$(wrangler d1 execute kivv-db --remote \
  --command "SELECT COUNT(*) as count FROM papers" | tail -1)
echo "$PAPER_COUNT"
echo ""

if echo "$PAPER_COUNT" | grep -q "0"; then
    echo "⚠️  No papers collected yet (automation runs daily at 6 AM UTC)"
    echo ""
    read -p "Would you like to trigger automation manually now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Triggering automation worker..."
        echo "(This may take 1-2 minutes...)"

        # Get CRON_SECRET from wrangler
        echo ""
        echo "⚠️  You need the CRON_SECRET to trigger automation manually."
        echo "Find it in: Cloudflare Dashboard → Workers → kivv-automation → Settings → Variables"
        echo ""
        read -p "Enter CRON_SECRET (or press ENTER to skip): " CRON_SECRET

        if [ ! -z "$CRON_SECRET" ]; then
            curl -X POST "$AUTOMATION_URL/run" \
              -H "Authorization: Bearer $CRON_SECRET"
            echo ""
            echo "✅ Automation triggered! Wait 1-2 minutes, then check papers again."
        else
            echo "Skipping manual trigger. Papers will be collected daily at 6 AM UTC."
        fi
    fi
else
    echo "✅ Papers found in database!"
fi

# =============================================================================
# STEP 5: Configure Claude Desktop
# =============================================================================

echo ""
echo "==================================================="
echo "🖥️  STEP 5: Configure Claude Desktop"
echo "==================================================="
echo ""

CONFIG_PATH="$HOME/.config/claude/claude_desktop_config.json"

echo "Claude Desktop config file: $CONFIG_PATH"
echo ""

if [ ! -f "$CONFIG_PATH" ]; then
    echo "Creating new config file..."
    mkdir -p "$(dirname "$CONFIG_PATH")"
    cat > "$CONFIG_PATH" <<EOF
{
  "mcpServers": {
    "kivv": {
      "url": "$MCP_URL/mcp",
      "headers": {
        "x-api-key": "$NEW_KEY"
      }
    }
  }
}
EOF
    echo "✅ Config file created!"
else
    echo "⚠️  Config file already exists. Add this configuration:"
    echo ""
    echo '  {'
    echo '    "mcpServers": {'
    echo '      "kivv": {'
    echo "        \"url\": \"$MCP_URL/mcp\","
    echo '        "headers": {'
    echo "          \"x-api-key\": \"$NEW_KEY\""
    echo '        }'
    echo '      }'
    echo '    }'
    echo '  }'
fi

echo ""
echo "==================================================="
echo "📱 STEP 6: Test in Claude Desktop"
echo "==================================================="
echo ""

echo "1. Restart Claude Desktop completely (quit from menu)"
echo "2. Open Claude Desktop"
echo "3. Try these commands:"
echo ""
echo "   📚 List my research papers"
echo "   🔍 Search for papers about transformers"
echo "   📌 Mark paper 1 as explored"
echo "   ⭐ Mark paper 1 as bookmarked"
echo ""

# =============================================================================
# STEP 7: RSS Feed URLs
# =============================================================================

echo "==================================================="
echo "📰 STEP 7: RSS Feed URLs"
echo "==================================================="
echo ""

echo "Add these to your RSS reader (Feedly, Inoreader, etc.):"
echo ""
echo "RSS 2.0: $MCP_URL/feeds/jeff/rss.xml"
echo "Atom 1.0: $MCP_URL/feeds/jeff/atom.xml"
echo ""

# =============================================================================
# STEP 8: Testing MCP Tools Directly
# =============================================================================

echo "==================================================="
echo "🧪 STEP 8: Test MCP Tools Directly"
echo "==================================================="
echo ""

echo "Test list_library tool:"
curl -s -X POST "$MCP_URL/mcp/list-library" \
  -H "x-api-key: $NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}' | jq '.'
echo ""

echo "Test search_papers tool:"
curl -s -X POST "$MCP_URL/mcp/search-papers" \
  -H "x-api-key: $NEW_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "transformer", "limit": 5}' | jq '.'
echo ""

# =============================================================================
# Summary
# =============================================================================

echo "==================================================="
echo "✅ SETUP COMPLETE!"
echo "==================================================="
echo ""
echo "Your kivv system is ready:"
echo ""
echo "  🌐 MCP Server: $MCP_URL"
echo "  ⚙️  Automation: $AUTOMATION_URL (runs daily at 6 AM UTC)"
echo "  🔑 Your API Key: $NEW_KEY"
echo "  📰 RSS Feed: $MCP_URL/feeds/jeff/rss.xml"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Desktop"
echo "  2. Try: 'List my research papers'"
echo "  3. Add RSS feed to your reader"
echo "  4. Wait for tomorrow's automation (6 AM UTC) or trigger manually"
echo ""
echo "Documentation:"
echo "  - SETUP.md - Detailed configuration guide"
echo "  - TROUBLESHOOTING.md - Common issues"
echo "  - DEPLOYMENT.md - Full deployment docs"
echo ""
echo "==================================================="

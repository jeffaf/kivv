# kivv - arXiv Research Assistant

Automated arXiv research paper discovery and AI-powered summarization system with MCP (Model Context Protocol) integration for Claude Desktop.

## Features

- **Daily Automation**: Automatically searches arXiv for papers matching your topics
- **AI Summaries**: Claude-powered intelligent paper summarization with cost optimization
- **Multi-User**: Support for multiple users with independent topic configurations
- **MCP Integration**: Direct integration with Claude Desktop via Model Context Protocol
- **RSS Feeds**: Per-user RSS/Atom feeds for any feed reader
- **Web Dashboard**: Optional SvelteKit dashboard (coming soon)
- **Cost-Effective**: Runs mostly on Cloudflare free tier (~$3/month for 2 users)

## Architecture

- **MCP Server**: TypeScript Worker handling MCP protocol and tool execution
- **Daily Automation**: Cron-triggered Worker for paper collection and summarization
- **Storage**: Cloudflare D1 (SQLite), R2 (PDFs), KV (cache)
- **AI**: Claude 3.5 Sonnet with Haiku triage for cost optimization

## Quick Start

See [docs/setup.md](docs/setup.md) for detailed setup instructions.

### Prerequisites

- Cloudflare account (jeffbarron@protonmail.com)
- Anthropic Claude API key
- Node.js 20+ and npm/bun
- Wrangler CLI (`npm install -g wrangler`)

### Installation

```bash
# Clone the repository
git clone https://github.com/jeffaf/kivv.git
cd kivv

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Create D1 database
wrangler d1 create kivv-db

# Deploy MCP server
cd mcp-server
wrangler deploy
```

## Documentation

- [Setup Guide](docs/setup.md)
- [API Documentation](docs/api.md)
- [Deployment Guide](docs/deployment.md)
- [PRD (Product Requirements Document)](https://github.com/jeffaf/kivv/blob/main/docs/kivv-prd-final.md)

## Development

```bash
# Run MCP server locally
cd mcp-server
wrangler dev

# Run tests
npm test
```

## License

MIT

## Author

Jeff Barron (jeffbarron@protonmail.com)

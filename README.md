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
- **Bun 1.1+** (package manager - install from [bun.sh](https://bun.sh))
- Wrangler CLI (installed automatically via bun)

### Installation

```bash
# Clone the repository
git clone https://github.com/jeffaf/kivv.git
cd kivv

# Install dependencies with bun
bun install

# Environment is already configured in .env (git-ignored)
# Infrastructure already set up:
# - D1 database: kivv-db (1e80f2bf-462d-4d51-8002-a4cf26013933)
# - KV namespace: KIVV_CACHE (7f6b7437931c4c268c27d01a4169101b)
# - R2 bucket: kivv-papers
```

## Project Structure

```
kivv/
├── mcp-server/          # MCP Server Worker (Claude integration)
├── automation/          # Daily automation Worker (cron)
├── shared/              # Shared types and utilities
├── tests/
│   ├── security/       # Security tests (auth, injection, XSS)
│   ├── integration/    # MCP tool integration tests
│   └── unit/           # Unit tests
├── .checkpoint/         # Development checkpoints
└── package.json         # Monorepo root with workspaces
```

## Documentation

- [Implementation Plan](IMPLEMENTATION-PLAN.md) - Chunked development guide
- [Setup Checklist](SETUP-CHECKLIST.md) - Infrastructure setup
- [PRD (Full Spec)](https://github.com/jeffaf/kivv) - Complete technical specification

## Development

```bash
# Run type checking
bun run type-check

# Run all tests
bun test

# Run security tests specifically
bun run test:security

# Run tests in watch mode
bun run test:watch

# Run MCP server locally
bun run dev:mcp

# Run automation worker locally
bun run dev:automation

# Build all workspaces
bun run build
```

## Testing

The project includes comprehensive test coverage:

- **Security Tests** (100% coverage required):
  - Authentication (API key validation)
  - Authorization (user data isolation)
  - SQL injection prevention
  - XSS prevention in RSS feeds
  - Rate limiting enforcement

- **Integration Tests**: End-to-end MCP tool workflows
- **Unit Tests**: Isolated utility function testing

```bash
# Run with coverage report
bun run test:coverage
```

## License

MIT

## Author

Jeff Barron (jeffbarron@protonmail.com)

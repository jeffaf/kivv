# kivv Deployment Guide

## Prerequisites

- Cloudflare account with Workers enabled
- Wrangler CLI installed and authenticated
- GitHub repository configured
- All required API keys (see setup.md)

## Manual Deployment

### 1. Deploy Database Schema

```bash
cd mcp-server
wrangler d1 execute kivv-db --file=./schema.sql --remote
```

### 2. Deploy MCP Server Worker

```bash
cd mcp-server
wrangler deploy
```

**Output:** Worker URL (e.g., `https://kivv-mcp.your-subdomain.workers.dev`)

### 3. Deploy Automation Worker

```bash
cd automation
wrangler deploy
```

### 4. Configure Cron Trigger

The automation worker should run daily. Verify cron trigger:

```bash
wrangler deployments list
```

Cron schedule is configured in `automation/wrangler.toml`:
```toml
[triggers]
crons = ["0 9 * * *"]  # Daily at 9 AM UTC
```

### 5. Verify Deployment

```bash
# Test MCP server health
curl https://kivv-mcp.your-subdomain.workers.dev/health

# View logs
wrangler tail kivv-mcp

# Check database
wrangler d1 execute kivv-db --command="SELECT COUNT(*) FROM papers"
```

## Automated Deployment (GitHub Actions)

The repository includes GitHub Actions workflows for automated deployment.

### Setup GitHub Secrets

1. Go to `https://github.com/jeffaf/kivv/settings/secrets/actions`
2. Add these secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLAUDE_API_KEY`
   - `D1_DATABASE_ID`

### Workflow Files

The `.github/workflows/` directory contains:

- `deploy-mcp.yml`: Deploy MCP server on push to main
- `deploy-automation.yml`: Deploy automation worker on push to main
- `test.yml`: Run tests on pull requests

### Trigger Deployment

```bash
# Commit and push to trigger deployment
git add .
git commit -m "Update MCP server"
git push origin main
```

GitHub Actions will automatically deploy to Cloudflare Workers.

## Environment-Specific Configuration

### Development

```bash
# Run MCP server locally
cd mcp-server
wrangler dev

# Test against local D1
wrangler d1 execute kivv-db --local --file=./schema.sql
```

### Production

Production configuration is in `wrangler.toml` files. Key settings:

**MCP Server (`mcp-server/wrangler.toml`):**
```toml
name = "kivv-mcp"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "kivv-db"
database_id = "your_database_id"

[[r2_buckets]]
binding = "PDFS"
bucket_name = "kivv-papers"

[[kv_namespaces]]
binding = "CACHE"
id = "your_kv_namespace_id"
```

## Monitoring

### View Worker Logs

```bash
# Real-time logs
wrangler tail kivv-mcp

# Filter for errors
wrangler tail kivv-mcp --format=pretty | grep ERROR
```

### Check Worker Analytics

1. Go to Cloudflare Dashboard
2. Navigate to Workers & Pages
3. Select your worker
4. View Metrics tab

### Database Monitoring

```bash
# Check database size
wrangler d1 info kivv-db

# View recent papers
wrangler d1 execute kivv-db --command="SELECT title, created_at FROM papers ORDER BY created_at DESC LIMIT 10"

# Count summaries
wrangler d1 execute kivv-db --command="SELECT COUNT(*) as total_summaries FROM summaries"
```

## Rollback Procedure

### Rollback to Previous Deployment

```bash
# List recent deployments
wrangler deployments list

# Rollback to specific deployment
wrangler rollback --deployment-id=<deployment-id>
```

### Restore Database Backup

```bash
# Export current database
wrangler d1 export kivv-db --output=backup.sql

# Restore from backup
wrangler d1 execute kivv-db --file=backup.sql
```

## Scaling Considerations

### Database Limits (D1 Free Tier)

- 5M reads/day
- 100k writes/day
- 5 GB storage

**Current usage:** ~10k reads/day, ~500 writes/day for 2 users

### Worker Limits (Free Tier)

- 100k requests/day
- 10ms CPU time per request
- 128 MB memory

**Current usage:** ~1k requests/day

### Cost Monitoring

```bash
# Approximate cost calculation
# D1: Free tier sufficient
# R2: $0.015/GB storage (minimal for PDFs)
# Workers: Free tier sufficient
# Claude API: ~$3/month for 2 users
```

## Troubleshooting

### Database Connection Errors

```bash
# Verify database binding
wrangler d1 list

# Test connection
wrangler d1 execute kivv-db --command="SELECT 1"
```

### Worker Deployment Failures

```bash
# Check authentication
wrangler whoami

# Verify wrangler.toml syntax
wrangler deploy --dry-run
```

### Cron Not Triggering

```bash
# Verify cron configuration
cat automation/wrangler.toml | grep cron

# Manually trigger for testing
curl -X POST https://kivv-automation.your-subdomain.workers.dev/run \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

## Security Best Practices

1. **Never commit secrets** - Use GitHub Secrets and Wrangler secrets
2. **Rotate API keys** - Regularly update Cloudflare and Claude API keys
3. **Monitor logs** - Watch for unauthorized access attempts
4. **Use HTTPS** - All Workers use HTTPS by default
5. **Validate inputs** - All user inputs are sanitized

## Backup Strategy

### Automated Backups

Add to your automation worker:

```bash
# Daily database export
wrangler d1 export kivv-db --output="backups/kivv-db-$(date +%Y%m%d).sql"

# Upload to R2
wrangler r2 object put kivv-backups/db-$(date +%Y%m%d).sql --file=backups/kivv-db-$(date +%Y%m%d).sql
```

### Manual Backup

```bash
# Export database
wrangler d1 export kivv-db --output=backup-$(date +%Y%m%d).sql

# Backup R2 bucket
wrangler r2 object list kivv-papers > r2-inventory-$(date +%Y%m%d).txt
```

## Support

For issues:
1. Check worker logs: `wrangler tail kivv-mcp`
2. Verify database connectivity
3. Review GitHub Actions logs
4. Check Cloudflare Dashboard for alerts

Contact: jeffbarron@protonmail.com

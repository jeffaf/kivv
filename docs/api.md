# kivv API Documentation

## MCP Server Endpoints

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok"
}
```

## MCP Tools

The kivv MCP server implements the Model Context Protocol and provides the following tools to Claude Desktop:

### 1. search_papers

Search for papers by topic, author, or keywords.

**Parameters:**
- `query` (string, required): Search query
- `max_results` (number, optional): Maximum results (default: 20)
- `category` (string, optional): arXiv category filter

**Returns:** List of papers with metadata

### 2. get_paper_summary

Get AI-generated summary of a specific paper.

**Parameters:**
- `paper_id` (string, required): arXiv paper ID

**Returns:** Paper summary with key insights

### 3. list_topics

List all configured research topics for the current user.

**Returns:** Array of topic configurations

### 4. add_topic

Add a new research topic to track.

**Parameters:**
- `topic` (string, required): Topic name/description
- `keywords` (array, required): Search keywords
- `categories` (array, optional): arXiv categories

**Returns:** Created topic object

### 5. get_recent_papers

Get recently discovered papers.

**Parameters:**
- `days` (number, optional): Days to look back (default: 7)
- `topic_id` (string, optional): Filter by topic

**Returns:** List of recent papers

## Automation Worker

The automation worker runs on a daily schedule and doesn't expose public endpoints. It can be triggered manually for testing:

```
POST /run
Authorization: Bearer <ADMIN_API_KEY>
```

## RSS Feeds

Per-user RSS feeds are available at:

```
GET /feed/{user_id}/rss
GET /feed/{user_id}/atom
```

**Parameters:**
- `user_id`: User identifier
- `api_key`: User API key (query parameter)

## Rate Limits

- **arXiv API**: 1 request per 3 seconds (enforced by Worker)
- **Claude API**: 50 requests per minute (tier dependent)
- **MCP Server**: 100 requests per minute per user

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

- `UNAUTHORIZED`: Invalid or missing API key
- `RATE_LIMIT`: Rate limit exceeded
- `NOT_FOUND`: Resource not found
- `INVALID_INPUT`: Invalid request parameters
- `INTERNAL_ERROR`: Server error

## Authentication

MCP requests must include the user's API key:

```json
{
  "apiKey": "your_api_key_here"
}
```

RSS feeds use query parameter authentication:
```
?api_key=your_api_key_here
```

## Database Schema

See `mcp-server/schema.sql` for complete schema definition.

### Key Tables

- `users`: User accounts and configurations
- `topics`: Research topics per user
- `papers`: Discovered papers metadata
- `summaries`: AI-generated summaries
- `user_papers`: User-specific paper tracking

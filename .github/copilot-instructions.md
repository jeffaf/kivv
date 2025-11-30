# Copilot Code Review Instructions for kivv

## Project Context

kivv is an arXiv research assistant running on Cloudflare Workers with MCP integration for Claude Desktop.

**Stack:** TypeScript, Cloudflare Workers (D1, KV, R2), Hono, Anthropic Claude API

## Review Priorities

### 1. Security (CRITICAL)

- **SQL Injection:** All queries MUST use parameterized queries (`db.prepare().bind()`)
- **XSS Prevention:** RSS/XML output must escape entities properly
- **API Key Validation:** All MCP endpoints require `x-api-key` header validation
- **User Data Isolation:** ALL queries must filter by `user_id` - no cross-user access
- **Secrets:** No API keys, tokens, or credentials in code (use environment variables)

**Example - Correct:**
```typescript
const papers = await env.DB
  .prepare('SELECT * FROM papers WHERE collected_for_user_id = ?')
  .bind(userId)
  .all();
```

**Example - WRONG:**
```typescript
const papers = await env.DB
  .prepare(`SELECT * FROM papers WHERE collected_for_user_id = ${userId}`)
  .all();
```

### 2. Cloudflare Workers Compatibility

- **NO Node.js APIs:** Cannot use `fs`, `path`, `http`, `buffer`, etc.
- **Use Workers APIs:** `crypto.subtle`, `fetch`, Workers bindings (D1, KV, R2)
- **Module Resolution:** Must be `"bundler"` in tsconfig.json
- **Runtime:** ES2022 syntax only

**Flag any usage of:**
- `require()` or `import * from 'fs'`
- Node.js built-ins
- Non-Workers-compatible libraries

### 3. Cost Optimization

- **Rate Limiting:** arXiv API: 1 req/3s + jitter, Anthropic: 5 req/s
- **Two-Stage Triage:** Use Haiku ($0.00025/paper) before Sonnet ($0.006/paper)
- **Caching:** Check `content_hash` before generating new summaries
- **Budget Enforcement:** Circuit breaker at $1/day

**Flag:**
- API calls without rate limiting
- Missing cache checks
- Unbounded loops that could exceed budget

### 4. Multi-User Data Isolation

Every database query MUST respect user boundaries:

```typescript
// CORRECT: User-isolated query
WHERE (collected_for_user_id = ? OR collected_for_user_id IS NULL)
AND EXISTS (SELECT 1 FROM user_paper_status WHERE user_id = ?)

// WRONG: No user filter
WHERE published_date > ?
```

**Critical Tables:**
- `topics` - MUST filter by `user_id`
- `user_paper_status` - MUST filter by `user_id`
- `papers` - Filter by `collected_for_user_id` or join with user_paper_status

### 5. TypeScript Quality

- **Strict Mode:** Enabled in all tsconfig.json files
- **No `any` types:** Use proper interfaces from `shared/types.ts`
- **Error Handling:** Catch all async errors, return proper HTTP status codes
- **Type Guards:** Validate external data (arXiv responses, user input)

**Flag:**
- `@ts-ignore` or `@ts-expect-error` without justification
- `any` types
- Unhandled promise rejections
- Missing error boundaries

### 6. Test Coverage

- **Security Tests:** 100% coverage required for auth/authorization
- **Critical Paths:** 90% coverage for summarization, arXiv client
- **Overall:** 80% coverage minimum

**Every new feature MUST include:**
- Unit tests (isolated function testing)
- Integration tests (API endpoint testing)
- Security tests (if touching auth/user data)

**Flag:**
- New code without tests
- Security-critical code without dedicated security tests
- Changes to auth without updating `tests/security/auth.test.ts`

## Common Issues to Flag

### High Priority

- Hardcoded API keys or credentials
- SQL queries without parameterization
- Cross-user data leaks
- Node.js API usage in Workers code
- Unbounded API calls (no rate limiting)
- Missing authentication on MCP endpoints

### Medium Priority

- Missing error handling
- Poor TypeScript types (`any`, unsafe casts)
- Missing tests for new features
- Performance issues (N+1 queries, inefficient loops)
- Missing input validation

### Low Priority

- Code style inconsistencies
- Missing JSDoc comments
- TODO comments without issue references
- Console.log statements (use structured logging)

## Suggested Improvements

When providing suggestions:
1. Reference specific lines of code
2. Provide corrected code examples
3. Explain the security/performance impact
4. Rate severity: CRITICAL, HIGH, MEDIUM, LOW
5. Link to relevant documentation when applicable

## Example Review Comment Format

```markdown
**Security: SQL Injection Risk** [CRITICAL]

Line 45: This query is vulnerable to SQL injection.

❌ Current:
\`\`\`typescript
db.prepare(\`SELECT * FROM papers WHERE title LIKE '%\${query}%'\`)
\`\`\`

✅ Fix:
\`\`\`typescript
db.prepare('SELECT * FROM papers WHERE title LIKE ?')
  .bind(\`%\${query}%\`)
\`\`\`

**Why:** Parameterized queries prevent SQL injection by separating data from query structure.

**Reference:** [Cloudflare D1 Best Practices](https://developers.cloudflare.com/d1/)
```

---

**Remember:** kivv handles academic research data and user authentication. Security and data isolation are non-negotiable.

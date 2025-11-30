# GitHub Copilot Code Review Setup

## Automatic Code Review with GitHub Copilot (2025)

GitHub Copilot now has **native code review** capabilities built-in. No workflow files needed!

### Setup Instructions

1. **Enable Copilot for your repository:**
   - Go to: https://github.com/jeffaf/kivv/settings
   - Navigate to: **Code security and analysis**
   - Find: **GitHub Copilot**
   - Enable: **Copilot code review**

2. **Configure automatic review rule:**
   - Go to: https://github.com/jeffaf/kivv/settings/rules
   - Click: **New rule** → **Copilot code review**
   - Enable: **Run on each push** (keeps feedback up-to-date)
   - Enable: **Run on drafts** (optional, for draft PRs)
   - Save the rule

3. **Configure review focus (optional):**
   In the rule settings, you can specify what Copilot should focus on:
   - Security vulnerabilities
   - Performance issues
   - Code style and best practices
   - Type safety
   - Test coverage

### How It Works

Once enabled:
- ✅ Copilot automatically reviews every PR within minutes
- ✅ Provides inline comments with specific suggestions
- ✅ Offers one-click fixes via Copilot Autofix
- ✅ Updates reviews as code changes (if "Run on each push" is enabled)
- ✅ Integrates with Code Quality scores

### Custom Review Prompts

For kivv-specific review criteria, create `.github/copilot-instructions.md`:

```markdown
## Code Review Focus for kivv

When reviewing kivv code, prioritize:

1. **Security** (CRITICAL):
   - SQL injection prevention (use parameterized queries)
   - XSS prevention in RSS feed generation
   - API key validation and user data isolation
   - No secrets in code

2. **Cloudflare Workers Compatibility**:
   - No Node.js APIs (fs, path, http, etc.)
   - Use Workers runtime APIs only
   - Check bindings (D1, KV, R2) are used correctly

3. **Cost Optimization**:
   - Rate limiting enforced (arXiv: 1 req/3s, Anthropic: 5 req/s)
   - Two-stage triage (Haiku → Sonnet)
   - Budget circuit breakers

4. **Multi-User Data Isolation**:
   - All queries filter by user_id
   - No cross-user data leaks

5. **TypeScript Quality**:
   - Strict type checking
   - No `any` types
   - Proper error handling

6. **Test Coverage**:
   - Security tests for auth/authorization
   - Integration tests for MCP tools
   - Minimum 80% coverage (90% for critical paths)
```

## Alternative: Manual Review

If automatic review isn't enabled, you can still request Copilot reviews manually:

1. Open any PR
2. Click **"Request review"**
3. Select **"Copilot"** as a reviewer
4. Copilot will review within 5 minutes

## References

- [Copilot Code Review (GA - April 2025)](https://github.blog/changelog/2025-04-04-copilot-code-review-now-generally-available/)
- [Automatic Review Repository Rule (September 2025)](https://github.blog/changelog/2025-09-10-copilot-code-review-independent-repository-rule-for-automatic-reviews/)
- [GitHub Copilot Documentation](https://docs.github.com/copilot/using-github-copilot/code-review/using-copilot-code-review)
- [GitHub Code Quality (October 2025)](https://github.blog/changelog/2025-10-28-github-code-quality-in-public-preview/)

---

**Note:** Copilot code review requires a paid Copilot subscription (included with GitHub Copilot or Copilot Enterprise).

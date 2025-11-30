/** arXiv API base URL for querying papers */
export declare const ARXIV_API_BASE_URL = "http://export.arxiv.org/api/query";
/** arXiv rate limit: 1 request per interval */
export declare const ARXIV_RATE_LIMIT_REQUESTS = 1;
/** arXiv rate limit interval: 3 seconds between requests */
export declare const ARXIV_RATE_LIMIT_INTERVAL_MS = 3000;
/** Random jitter added to arXiv requests (0-200ms) to avoid detection patterns */
export declare const ARXIV_RATE_LIMIT_JITTER_MS = 200;
/** Maximum results per arXiv API request (API limit) */
export declare const ARXIV_MAX_RESULTS_PER_REQUEST = 100;
/** Anthropic API base URL */
export declare const ANTHROPIC_API_BASE_URL = "https://api.anthropic.com/v1";
/** Anthropic rate limit: 5 requests per second */
export declare const ANTHROPIC_RATE_LIMIT_REQUESTS = 5;
/** Anthropic rate limit interval: 1 second */
export declare const ANTHROPIC_RATE_LIMIT_INTERVAL_MS = 1000;
/** Claude 3.5 Haiku model identifier (for triage) */
export declare const CLAUDE_HAIKU_MODEL = "claude-3-5-haiku-20241022";
/** Claude 3.5 Sonnet model identifier (for summaries) */
export declare const CLAUDE_SONNET_MODEL = "claude-3-5-sonnet-20241022";
/** Maximum output tokens for Sonnet summaries (3 bullet points) */
export declare const MAX_SUMMARY_OUTPUT_TOKENS = 120;
/** Maximum output tokens for Haiku triage (just a number 0.0-1.0) */
export declare const MAX_TRIAGE_OUTPUT_TOKENS = 10;
/** Daily budget cap in USD - circuit breaker threshold */
export declare const DAILY_BUDGET_CAP_USD = 1;
/** Budget warning threshold (50% of daily cap) */
export declare const BUDGET_WARNING_THRESHOLD = 0.5;
/** Budget critical threshold (80% of daily cap) */
export declare const BUDGET_CRITICAL_THRESHOLD = 0.8;
/** Default relevance threshold for paper triage (papers below this are skipped) */
export declare const DEFAULT_RELEVANCE_THRESHOLD = 0.7;
/** Minimum allowed relevance threshold */
export declare const MIN_RELEVANCE_THRESHOLD = 0;
/** Maximum allowed relevance threshold */
export declare const MAX_RELEVANCE_THRESHOLD = 1;
/** RSS feed cache TTL (5 minutes) */
export declare const RSS_FEED_CACHE_TTL = 300;
/** Rate limit state TTL (1 hour) */
export declare const RATE_LIMIT_STATE_TTL = 3600;
/** Checkpoint TTL (24 hours) - for resumable cron jobs */
export declare const CHECKPOINT_TTL = 86400;
/** Default page limit for list_library tool */
export declare const DEFAULT_PAGE_LIMIT = 50;
/** Maximum page limit (prevent excessive queries) */
export declare const MAX_PAGE_LIMIT = 100;
/** 200 OK - Request succeeded */
export declare const HTTP_OK = 200;
/** 201 Created - Resource created successfully */
export declare const HTTP_CREATED = 201;
/** 400 Bad Request - Invalid request parameters */
export declare const HTTP_BAD_REQUEST = 400;
/** 401 Unauthorized - Missing or invalid authentication */
export declare const HTTP_UNAUTHORIZED = 401;
/** 403 Forbidden - Valid auth but insufficient permissions */
export declare const HTTP_FORBIDDEN = 403;
/** 404 Not Found - Resource does not exist */
export declare const HTTP_NOT_FOUND = 404;
/** 429 Too Many Requests - Rate limit exceeded */
export declare const HTTP_TOO_MANY_REQUESTS = 429;
/** 500 Internal Server Error - Server error */
export declare const HTTP_INTERNAL_ERROR = 500;
/** Invalid API key provided */
export declare const ERROR_INVALID_API_KEY = "INVALID_API_KEY";
/** User account is inactive */
export declare const ERROR_USER_INACTIVE = "USER_INACTIVE";
/** Missing authentication header */
export declare const ERROR_MISSING_AUTH = "MISSING_AUTH";
/** Rate limit exceeded */
export declare const ERROR_RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED";
/** Daily budget exceeded */
export declare const ERROR_BUDGET_EXCEEDED = "BUDGET_EXCEEDED";
/** Invalid input parameters */
export declare const ERROR_INVALID_INPUT = "INVALID_INPUT";
/** Database error */
export declare const ERROR_DATABASE = "DATABASE_ERROR";
/** External API error (arXiv, Anthropic) */
export declare const ERROR_EXTERNAL_API = "EXTERNAL_API_ERROR";

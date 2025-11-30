/**
 * Generate SHA-256 hash of text (for content deduplication)
 * Uses Workers crypto.subtle API (NOT Node.js crypto)
 *
 * @param text - The text to hash
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * const hash = await hashContent("Machine Learning Paper Title...");
 * // Returns: "a3f2b9c8d..."
 */
export declare function hashContent(text: string): Promise<string>;
/**
 * Generate UUID v4 (for API keys, request IDs)
 * Uses Workers crypto.randomUUID() (NOT Node.js crypto)
 *
 * @returns UUID v4 string
 *
 * @example
 * const apiKey = generateId();
 * // Returns: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
 */
export declare function generateId(): string;
/**
 * Parse JSON array from SQLite TEXT field safely
 * Authors and categories are stored as JSON strings in D1
 *
 * @param jsonString - JSON-encoded array string
 * @returns Parsed array or empty array on error
 *
 * @example
 * const authors = parseJsonArray<string>('["Alice", "Bob"]');
 * // Returns: ["Alice", "Bob"]
 *
 * const invalid = parseJsonArray<string>('not json');
 * // Returns: []
 */
export declare function parseJsonArray<T>(jsonString: string): T[];
/**
 * Format date to YYYY-MM-DD (for SQLite DATE queries)
 *
 * @param date - Date object to format
 * @returns ISO date string (YYYY-MM-DD)
 *
 * @example
 * const today = formatDate(new Date());
 * // Returns: "2025-11-30"
 */
export declare function formatDate(date: Date): string;
/**
 * Calculate cost in USD based on token usage
 * From PRD: Haiku $0.25/1M input, $1.25/1M output
 *          Sonnet $3/1M input, $15/1M output
 *
 * @param tokens - Number of tokens
 * @param model - Model and direction ('haiku-input' | 'haiku-output' | 'sonnet-input' | 'sonnet-output')
 * @returns Cost in USD
 *
 * @example
 * const cost = calculateCost(1000, 'haiku-input');
 * // Returns: 0.00025
 */
export declare function calculateCost(tokens: number, model: 'haiku-input' | 'haiku-output' | 'sonnet-input' | 'sonnet-output'): number;
/**
 * Create standardized API error response
 * Used by MCP server to return consistent error format
 *
 * @param error - Human-readable error message
 * @param code - Machine-readable error code
 * @param status - HTTP status code
 * @param details - Optional additional error details
 * @returns Response object with JSON error body
 *
 * @example
 * return createErrorResponse(
 *   'Invalid API key',
 *   'INVALID_API_KEY',
 *   401,
 *   { provided_key: 'abc***' }
 * );
 */
export declare function createErrorResponse(error: string, code: string, status: number, details?: Record<string, unknown>): Response;
/**
 * Validate and sanitize arXiv ID format
 * arXiv ID format: YYMM.NNNNN or YYMM.NNNNNN or arXiv:YYMM.NNNNN
 *
 * @param id - arXiv ID to validate
 * @returns True if valid arXiv ID format
 *
 * @example
 * validateArxivId('2311.12345'); // true
 * validateArxivId('arXiv:2311.12345'); // true
 * validateArxivId('invalid'); // false
 */
export declare function validateArxivId(id: string): boolean;
/**
 * Sleep/delay utility (for rate limiting, retries)
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 *
 * @example
 * await sleep(3000); // Wait 3 seconds
 */
export declare function sleep(ms: number): Promise<void>;

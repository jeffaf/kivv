// =============================================================================
// kivv - arXiv API Client
// =============================================================================
// Robust arXiv API client with strict rate limiting
// CRITICAL: arXiv requires 1 request per 3 seconds minimum + jitter
// Workers-compatible (NO Node.js APIs)
// =============================================================================

import { sleep } from './utils';

/**
 * Paper data structure returned by arXiv API
 * Matches subset of Paper interface from types.ts (before DB insertion)
 */
export interface ArxivPaper {
  arxiv_id: string;          // arXiv ID (e.g., "2101.12345")
  title: string;
  authors: string;           // Comma-separated author names
  abstract: string;
  published_date: string;    // ISO 8601 date
  arxiv_url: string;         // arXiv abstract page URL
  pdf_url: string;           // arXiv PDF download URL
  categories: string;        // Comma-separated categories
}

/**
 * Search parameters for arXiv API
 */
export interface ArxivSearchParams {
  query: string;                                          // Search query (e.g., "cat:cs.AI")
  maxResults?: number;                                   // Max results to return (default: 10, max: 2000)
  start?: number;                                        // Starting index for pagination (default: 0)
  sortBy?: 'submittedDate' | 'lastUpdatedDate' | 'relevance'; // Sort order (default: submittedDate)
  sortOrder?: 'ascending' | 'descending';                // Sort direction (default: descending)
}

/**
 * arXiv API client with strict rate limiting
 *
 * Rate limit: 1 request per 3 seconds + random jitter (100-500ms)
 *
 * @example
 * const client = new ArxivClient();
 * const papers = await client.search({
 *   query: 'cat:cs.AI',
 *   maxResults: 10
 * });
 */
export class ArxivClient {
  private static readonly BASE_URL = 'http://export.arxiv.org/api/query';
  private static readonly RATE_LIMIT_MS = 3000;  // 3 seconds between requests
  private static readonly MIN_JITTER_MS = 100;   // Minimum random jitter
  private static readonly MAX_JITTER_MS = 500;   // Maximum random jitter

  private lastRequestTime = 0;

  /**
   * Enforce rate limit: wait if needed before making next request
   * Implements 3-second delay + random jitter to avoid pattern detection
   *
   * @private
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    // Add random jitter to avoid pattern detection
    const jitter = Math.random() * (ArxivClient.MAX_JITTER_MS - ArxivClient.MIN_JITTER_MS) + ArxivClient.MIN_JITTER_MS;
    const requiredDelay = ArxivClient.RATE_LIMIT_MS + jitter;

    if (timeSinceLastRequest < requiredDelay) {
      const sleepMs = requiredDelay - timeSinceLastRequest;
      await sleep(sleepMs);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Search arXiv for papers matching query
   *
   * @param params - Search parameters (query, pagination, sorting)
   * @returns Array of papers (empty array on error)
   *
   * @example
   * // Search for AI papers
   * const papers = await client.search({
   *   query: 'cat:cs.AI',
   *   maxResults: 20,
   *   sortBy: 'submittedDate',
   *   sortOrder: 'descending'
   * });
   *
   * @example
   * // Search with pagination
   * const morePapers = await client.search({
   *   query: 'all:transformers',
   *   start: 20,
   *   maxResults: 20
   * });
   */
  async search(params: ArxivSearchParams): Promise<ArxivPaper[]> {
    // Enforce rate limit before making request
    await this.enforceRateLimit();

    // Build URL with query parameters
    const url = new URL(ArxivClient.BASE_URL);
    url.searchParams.set('search_query', params.query);
    url.searchParams.set('max_results', String(params.maxResults || 10));
    url.searchParams.set('start', String(params.start || 0));
    url.searchParams.set('sortBy', params.sortBy || 'submittedDate');
    url.searchParams.set('sortOrder', params.sortOrder || 'descending');

    try {
      const response = await fetch(url.toString());

      if (!response.ok) {
        console.error(`arXiv API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const xmlText = await response.text();
      return this.parseAtomXml(xmlText);
    } catch (error) {
      console.error('arXiv API request failed:', error);
      return [];
    }
  }

  /**
   * Parse Atom XML response from arXiv API
   * Uses regex-based parsing (Workers-compatible, no external dependencies)
   *
   * @param xml - Atom XML response from arXiv
   * @returns Array of parsed papers
   *
   * @private
   */
  private parseAtomXml(xml: string): ArxivPaper[] {
    const papers: ArxivPaper[] = [];

    // Extract all <entry> elements
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const entries = xml.match(entryRegex) || [];

    for (const entry of entries) {
      try {
        // Extract required fields
        const arxiv_id = this.extractArxivId(entry);
        const title = this.extractTag(entry, 'title');
        const abstract = this.extractTag(entry, 'summary');
        const published_date = this.extractTag(entry, 'published');
        const authors = this.extractAuthors(entry);
        const categories = this.extractCategories(entry);

        // Extract URLs (use fallback if not in XML)
        const arxiv_url = this.extractLink(entry, 'alternate') || `http://arxiv.org/abs/${arxiv_id}`;
        const pdf_url = this.extractLink(entry, 'related') || `http://arxiv.org/pdf/${arxiv_id}`;

        // Skip entries missing critical fields
        if (!arxiv_id || !title || !abstract) {
          console.warn('Skipping entry: missing required fields (arxiv_id, title, or abstract)');
          continue;
        }

        papers.push({
          arxiv_id,
          title: title.trim(),
          authors: authors.trim(),
          abstract: abstract.trim(),
          published_date,
          arxiv_url,
          pdf_url,
          categories: categories.trim(),
        });
      } catch (error) {
        console.error('Failed to parse entry:', error);
        // Continue parsing other entries
        continue;
      }
    }

    return papers;
  }

  /**
   * Extract arXiv ID from entry XML
   * Removes version suffix (e.g., "2101.12345v1" → "2101.12345")
   *
   * @param xml - Entry XML fragment
   * @returns arXiv ID (without version)
   *
   * @private
   */
  private extractArxivId(xml: string): string {
    const match = xml.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);
    if (!match) return '';

    // Remove version suffix (v1, v2, etc.)
    return match[1].replace(/v\d+$/, '');
  }

  /**
   * Extract simple XML tag content
   *
   * @param xml - XML fragment
   * @param tagName - Tag name to extract
   * @returns Tag content (empty string if not found)
   *
   * @private
   */
  private extractTag(xml: string, tagName: string): string {
    const match = xml.match(new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's'));
    return match ? match[1].trim() : '';
  }

  /**
   * Extract all authors from entry XML
   * Returns comma-separated list of author names
   *
   * @param xml - Entry XML fragment
   * @returns Comma-separated authors (e.g., "Alice, Bob, Charlie")
   *
   * @private
   */
  private extractAuthors(xml: string): string {
    const authorRegex = /<author>\s*<name>(.*?)<\/name>\s*<\/author>/g;
    const authors: string[] = [];
    let match;

    while ((match = authorRegex.exec(xml)) !== null) {
      authors.push(match[1].trim());
    }

    return authors.join(', ');
  }

  /**
   * Extract all categories from entry XML
   * Returns comma-separated list of category terms
   *
   * @param xml - Entry XML fragment
   * @returns Comma-separated categories (e.g., "cs.AI, cs.LG")
   *
   * @private
   */
  private extractCategories(xml: string): string {
    const categoryRegex = /<category\s+term="([^"]+)"/g;
    const categories: string[] = [];
    let match;

    while ((match = categoryRegex.exec(xml)) !== null) {
      categories.push(match[1]);
    }

    return categories.join(', ');
  }

  /**
   * Extract link URL by rel attribute
   *
   * @param xml - Entry XML fragment
   * @param rel - Link rel attribute ("alternate" for abstract, "related" for PDF)
   * @returns URL (null if not found)
   *
   * @private
   */
  private extractLink(xml: string, rel: string): string | null {
    const match = xml.match(new RegExp(`<link[^>]+rel="${rel}"[^>]+href="([^"]+)"`));
    return match ? match[1] : null;
  }
}

/**
 * Helper class to build arXiv search queries
 *
 * Supports:
 * - Category searches (cat:cs.AI)
 * - Keyword searches (all:transformers)
 * - Title searches (ti:attention)
 * - Author searches (au:Vaswani)
 * - AND/OR combinations
 *
 * @example
 * const query = new ArxivQueryBuilder()
 *   .addCategory('cs.AI')
 *   .addCategory('cs.LG')
 *   .build('OR');
 * // Returns: "cat:cs.AI OR cat:cs.LG"
 *
 * @example
 * const query = new ArxivQueryBuilder()
 *   .addKeyword('transformers')
 *   .addKeyword('attention')
 *   .build('AND');
 * // Returns: "all:transformers AND all:attention"
 */
export class ArxivQueryBuilder {
  private terms: string[] = [];

  /**
   * Add category search term (e.g., "cs.AI", "cs.LG")
   *
   * @param category - arXiv category code
   * @returns this (for chaining)
   */
  addCategory(category: string): this {
    this.terms.push(`cat:${category}`);
    return this;
  }

  /**
   * Add keyword search term (searches all fields)
   *
   * @param keyword - Keyword to search
   * @returns this (for chaining)
   */
  addKeyword(keyword: string): this {
    this.terms.push(`all:${keyword}`);
    return this;
  }

  /**
   * Add title-only keyword search term
   *
   * @param keyword - Keyword to search in titles
   * @returns this (for chaining)
   */
  addTitleKeyword(keyword: string): this {
    this.terms.push(`ti:${keyword}`);
    return this;
  }

  /**
   * Add author search term
   *
   * @param author - Author name to search
   * @returns this (for chaining)
   */
  addAuthor(author: string): this {
    this.terms.push(`au:${author}`);
    return this;
  }

  /**
   * Add abstract-only keyword search term
   *
   * @param keyword - Keyword to search in abstracts
   * @returns this (for chaining)
   */
  addAbstractKeyword(keyword: string): this {
    this.terms.push(`abs:${keyword}`);
    return this;
  }

  /**
   * Build final query string with specified operator
   *
   * @param operator - Logical operator to join terms ('AND' or 'OR')
   * @returns Complete arXiv search query
   */
  build(operator: 'AND' | 'OR' = 'OR'): string {
    return this.terms.join(` ${operator} `);
  }

  /**
   * Reset builder to empty state
   *
   * @returns this (for chaining)
   */
  reset(): this {
    this.terms = [];
    return this;
  }
}

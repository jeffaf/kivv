// =============================================================================
// kivv - MCP Server: list_library Tool
// =============================================================================
// Returns user's paper library with optional filtering and pagination
// SECURITY-CRITICAL: All queries filtered by authenticated user ID
// =============================================================================

import { Context } from 'hono';
import { Env, User, PaperWithStatus, ListLibraryRequest } from '../../../shared/types';
import {
  HTTP_OK,
  HTTP_BAD_REQUEST,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  ERROR_INVALID_INPUT,
} from '../../../shared/constants';
import { createErrorResponse } from '../../../shared/utils';

// =============================================================================
// Response Type
// =============================================================================

interface ListLibraryResponse {
  papers: PaperWithStatus[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// Core Implementation
// =============================================================================

/**
 * list_library MCP Tool - Query user's paper library
 *
 * Features:
 * - User-isolated queries (JOIN with user_paper_status)
 * - Pagination (limit/offset)
 * - Filters (explored, bookmarked)
 * - SQL injection prevention (parameterized queries)
 *
 * @param c - Hono context with authenticated user
 * @returns JSON response with papers array and pagination metadata
 *
 * @example
 * POST /mcp/tools/list_library
 * Headers: { "x-api-key": "user_api_key" }
 * Body: { "limit": 20, "offset": 0, "explored": true }
 *
 * Response:
 * {
 *   "papers": [...],
 *   "total": 150,
 *   "limit": 20,
 *   "offset": 0
 * }
 */
export async function listLibrary(c: Context) {
  // Get authenticated user from middleware
  const user = c.get('user') as User;

  // Parse request body
  let body: ListLibraryRequest;
  try {
    body = await c.req.json<ListLibraryRequest>();
  } catch (error) {
    // Empty body is valid (use defaults)
    body = {};
  }

  // Validate and sanitize pagination parameters
  const limit = validateLimit(body.limit);
  const offset = validateOffset(body.offset);

  if (limit === null || offset === null) {
    return createErrorResponse(
      'Invalid pagination parameters. limit must be 1-100, offset must be >= 0.',
      ERROR_INVALID_INPUT,
      HTTP_BAD_REQUEST
    );
  }

  // Build WHERE clause with user isolation
  const filters: string[] = ['ups.user_id = ?'];
  const bindings: (number | boolean)[] = [user.id];

  // Add optional explored filter
  if (body.explored !== undefined && body.explored !== null) {
    filters.push('ups.explored = ?');
    bindings.push(body.explored ? 1 : 0);
  }

  // Add optional bookmarked filter
  if (body.bookmarked !== undefined && body.bookmarked !== null) {
    filters.push('ups.bookmarked = ?');
    bindings.push(body.bookmarked ? 1 : 0);
  }

  const whereClause = filters.join(' AND ');

  // Execute main query with JOIN
  // SECURITY: All queries filter by user_id to prevent cross-user access
  const query = `
    SELECT
      p.id,
      p.arxiv_id,
      p.title,
      p.authors,
      p.abstract,
      p.categories,
      p.published_date,
      p.pdf_url,
      p.r2_key,
      p.summary,
      p.summary_generated_at,
      p.summary_model,
      p.relevance_score,
      p.content_hash,
      p.collected_for_user_id,
      p.created_at,
      ups.explored,
      ups.bookmarked,
      ups.notes,
      ups.read_at
    FROM papers p
    INNER JOIN user_paper_status ups ON p.id = ups.paper_id
    WHERE ${whereClause}
    ORDER BY p.published_date DESC
    LIMIT ? OFFSET ?
  `;

  try {
    // Add pagination parameters to bindings
    const queryBindings = [...bindings, limit, offset];

    const result = await c.env.DB
      .prepare(query)
      .bind(...queryBindings)
      .all<PaperWithStatus>();

    // Get total count for pagination metadata
    const countQuery = `
      SELECT COUNT(*) as total
      FROM papers p
      INNER JOIN user_paper_status ups ON p.id = ups.paper_id
      WHERE ${whereClause}
    `;

    const countResult = await c.env.DB
      .prepare(countQuery)
      .bind(...bindings)
      .first<{ total: number }>();

    const total = countResult?.total ?? 0;

    // Convert SQLite boolean integers (0/1) to TypeScript booleans
    const papers = result.results.map(paper => ({
      ...paper,
      explored: Boolean(paper.explored),
      bookmarked: Boolean(paper.bookmarked),
    }));

    const response: ListLibraryResponse = {
      papers,
      total,
      limit,
      offset,
    };

    return c.json(response, HTTP_OK);

  } catch (error) {
    console.error('[list_library] Database error:', error);
    return createErrorResponse(
      'Failed to query library',
      'DATABASE_ERROR',
      500
    );
  }
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate limit parameter
 * @param limit - Requested limit (undefined = default)
 * @returns Validated limit or null if invalid
 */
function validateLimit(limit: number | undefined): number | null {
  if (limit === undefined) {
    return DEFAULT_PAGE_LIMIT;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    return null;
  }

  return limit;
}

/**
 * Validate offset parameter
 * @param offset - Requested offset (undefined = 0)
 * @returns Validated offset or null if invalid
 */
function validateOffset(offset: number | undefined): number | null {
  if (offset === undefined) {
    return 0;
  }

  if (!Number.isInteger(offset) || offset < 0) {
    return null;
  }

  return offset;
}

// =============================================================================
// kivv - RSS/Atom Feed Generator
// =============================================================================
// Generates RSS 2.0 and Atom 1.0 feeds for user paper libraries
// Includes comprehensive XML escaping to prevent XSS attacks
// =============================================================================

import { PaperWithStatus } from '../../../shared/types';

// =============================================================================
// XML Escaping Utilities
// =============================================================================

/**
 * Escape XML entities to prevent XSS attacks
 * Converts special characters to their XML entity equivalents
 *
 * @param text - Text to escape (handles null/undefined gracefully)
 * @returns Escaped XML-safe string
 */
export function escapeXml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')   // & must be first to avoid double-escaping
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// Date Formatting Utilities
// =============================================================================

/**
 * Convert ISO 8601 date to RFC 822 format (for RSS 2.0)
 * Example: "2025-11-30T10:00:00.000Z" → "Sat, 30 Nov 2025 10:00:00 GMT"
 *
 * @param isoDate - ISO 8601 date string
 * @returns RFC 822 formatted date string
 */
export function toRFC822(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

/**
 * Convert ISO 8601 date to RFC 3339 format (for Atom 1.0)
 * Example: "2025-11-30T10:00:00.000Z" → "2025-11-30T10:00:00Z"
 *
 * @param isoDate - ISO 8601 date string
 * @returns RFC 3339 formatted date string (same as ISO 8601)
 */
export function toRFC3339(isoDate: string): string {
  return new Date(isoDate).toISOString();
}

// =============================================================================
// RSS 2.0 Feed Generator
// =============================================================================

/**
 * Generate RSS 2.0 feed for a user's paper library
 *
 * @param username - User's username (used in feed metadata)
 * @param papers - Array of papers to include in feed (max 50)
 * @param baseUrl - Base URL for feed links (default: https://kivv.example.com)
 * @returns Complete RSS 2.0 XML document
 */
export function generateRSS(
  username: string,
  papers: PaperWithStatus[],
  baseUrl: string = 'https://kivv.example.com'
): string {
  const now = new Date().toUTCString();
  const feedUrl = `${baseUrl}/feeds/${username}/rss.xml`;

  // Generate RSS items for each paper
  const items = papers.map(paper => {
    // Build description with abstract and authors
    const description = [
      `<p>${escapeXml(paper.abstract)}</p>`,
      `<p><strong>Authors:</strong> ${escapeXml(paper.authors)}</p>`,
      paper.categories ? `<p><strong>Categories:</strong> ${escapeXml(paper.categories)}</p>` : '',
      paper.explored ? '<p><em>Explored</em></p>' : '',
      paper.bookmarked ? '<p><em>⭐ Bookmarked</em></p>' : '',
      paper.notes ? `<p><strong>Notes:</strong> ${escapeXml(paper.notes)}</p>` : '',
    ].filter(Boolean).join('\n');

    return `    <item>
      <title>${escapeXml(paper.title)}</title>
      <link>${escapeXml(paper.pdf_url)}</link>
      <description>${description}</description>
      <pubDate>${toRFC822(paper.published_date)}</pubDate>
      <guid isPermaLink="false">${escapeXml(paper.arxiv_id)}</guid>
      <author>${escapeXml(paper.authors)}</author>
    </item>`;
  }).join('\n');

  // Generate complete RSS 2.0 document
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>kivv - Research Papers for ${escapeXml(username)}</title>
    <link>${baseUrl}</link>
    <description>Latest arXiv papers collected for ${escapeXml(username)}</description>
    <lastBuildDate>${now}</lastBuildDate>
    <language>en-us</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

// =============================================================================
// Atom 1.0 Feed Generator
// =============================================================================

/**
 * Generate Atom 1.0 feed for a user's paper library
 *
 * @param username - User's username (used in feed metadata)
 * @param papers - Array of papers to include in feed (max 50)
 * @param baseUrl - Base URL for feed links (default: https://kivv.example.com)
 * @returns Complete Atom 1.0 XML document
 */
export function generateAtom(
  username: string,
  papers: PaperWithStatus[],
  baseUrl: string = 'https://kivv.example.com'
): string {
  const now = new Date().toISOString();
  const feedUrl = `${baseUrl}/feeds/${username}/atom.xml`;

  // Generate Atom entries for each paper
  const entries = papers.map(paper => {
    // Build summary with abstract, authors, and user metadata
    const summaryParts = [
      escapeXml(paper.abstract),
      `\n\nAuthors: ${escapeXml(paper.authors)}`,
      paper.categories ? `\nCategories: ${escapeXml(paper.categories)}` : '',
      paper.explored ? '\n\n[Explored]' : '',
      paper.bookmarked ? '\n[⭐ Bookmarked]' : '',
      paper.notes ? `\n\nNotes: ${escapeXml(paper.notes)}` : '',
    ].filter(Boolean).join('');

    return `  <entry>
    <title>${escapeXml(paper.title)}</title>
    <link href="${escapeXml(paper.pdf_url)}"/>
    <id>urn:arxiv:${escapeXml(paper.arxiv_id)}</id>
    <updated>${toRFC3339(paper.published_date)}</updated>
    <summary>${summaryParts}</summary>
    <author><name>${escapeXml(paper.authors)}</name></author>
  </entry>`;
  }).join('\n');

  // Generate complete Atom 1.0 document
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>kivv - Research Papers for ${escapeXml(username)}</title>
  <link href="${feedUrl}" rel="self"/>
  <link href="${baseUrl}"/>
  <updated>${now}</updated>
  <id>urn:kivv:feeds:${escapeXml(username)}</id>
  <subtitle>Latest arXiv papers collected for ${escapeXml(username)}</subtitle>
${entries}
</feed>`;
}

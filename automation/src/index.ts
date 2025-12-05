// =============================================================================
// kivv - Automation Worker with Checkpointed Cron Execution
// =============================================================================
// Daily automation workflow:
// 1. Fetch each user's topics from database
// 2. Search arXiv for papers matching topics (last 24 hours)
// 3. Summarize papers using two-stage AI (Haiku triage + Sonnet summary)
// 4. Store papers and summaries in database
// 5. Use checkpoints to handle failures gracefully
// =============================================================================

import { Env, User, Topic, Paper } from '../../shared/types';
import { ArxivClient, ArxivQueryBuilder } from '../../shared/arxiv-client';
import { SummarizationClient } from '../../shared/summarization';
import { hashContent, formatDate } from '../../shared/utils';
import { CLAUDE_SONNET_MODEL } from '../../shared/constants';

// =============================================================================
// Configuration Constants
// =============================================================================

const BATCH_SIZE = 8; // Papers per run to stay under 30s cron timeout

// =============================================================================
// Types & Interfaces
// =============================================================================

/**
 * Checkpoint structure for resumable cron execution
 * Stored in KV with key: checkpoint:automation:{date}
 */
interface Checkpoint {
  date: string;                    // YYYY-MM-DD
  users_processed: number;         // Count of users completed
  papers_found: number;            // Total papers found from arXiv
  papers_summarized: number;       // Total papers successfully summarized
  papers_skipped: number;          // Papers that were irrelevant
  papers_processed_this_run: number; // Track batch progress within current run
  total_cost: number;              // Total AI cost in USD
  errors: string[];                // Array of error messages
  last_user_id?: number;           // Last successfully processed user ID (for resume)
  last_paper_arxiv_id?: string;    // For resuming within a user's papers
  completed: boolean;              // True when all users processed
}

/**
 * Result from processing a single user
 */
interface UserProcessingResult {
  papers_found: number;
  papers_summarized: number;
  papers_skipped: number;
  cost: number;
  batch_exhausted: boolean;        // True if we hit batch limit
  last_arxiv_id?: string;          // Last paper arxiv_id processed
}

/**
 * Result from running automation
 */
interface AutomationResult {
  batch_complete: boolean;         // True if batch limit reached
  total_complete: boolean;         // True if all users and papers done
  checkpoint: Checkpoint;
}

// =============================================================================
// Cloudflare Workers Export
// =============================================================================

export default {
  /**
   * Scheduled cron handler - runs daily at 6 AM UTC
   * Triggered automatically by Cloudflare cron
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[CRON] Starting daily automation at', new Date().toISOString());

    try {
      await runAutomation(env);
    } catch (error) {
      console.error('[CRON] Fatal error:', error);
      // Re-throw to mark the cron run as failed in Cloudflare dashboard
      throw error;
    }
  },

  /**
   * Manual trigger endpoint (for testing and debugging)
   * Requires authentication via Authorization header
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'kivv-automation',
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Status endpoint - check current checkpoint
    if (url.pathname === '/status') {
      const today = formatDate(new Date());
      const checkpointKey = `checkpoint:automation:${today}`;
      const checkpoint = await loadCheckpoint(env, checkpointKey);

      return new Response(JSON.stringify({
        status: 'ok',
        checkpoint: checkpoint || { message: 'No checkpoint for today' },
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Manual trigger endpoint
    if (url.pathname === '/run' && request.method === 'POST') {
      // Only allow cron or manual trigger with secret
      const cronHeader = request.headers.get('cf-cron');
      const authHeader = request.headers.get('authorization');
      const cronSecret = env.CRON_SECRET || 'test-secret';

      if (!cronHeader && authHeader !== `Bearer ${cronSecret}`) {
        return new Response(JSON.stringify({
          error: 'Forbidden',
          message: 'Invalid or missing authorization'
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        console.log('[MANUAL] Manual automation run triggered');
        const result = await runAutomation(env);

        return new Response(JSON.stringify({
          success: true,
          message: result.total_complete ? 'All papers processed for today' : `Batch complete (${BATCH_SIZE} papers)`,
          batch_complete: result.batch_complete,
          total_complete: result.total_complete,
          checkpoint: {
            users_processed: result.checkpoint.users_processed,
            papers_found: result.checkpoint.papers_found,
            papers_summarized: result.checkpoint.papers_summarized,
            papers_skipped: result.checkpoint.papers_skipped,
            papers_processed_this_run: result.checkpoint.papers_processed_this_run,
            total_cost: result.checkpoint.total_cost,
            completed: result.checkpoint.completed
          },
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[MANUAL] Error:', error);
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Default response
    return new Response('kivv Automation Worker\n\nEndpoints:\n- GET /health - Health check\n- POST /run - Manual trigger (requires auth)', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

// =============================================================================
// Main Automation Workflow
// =============================================================================

/**
 * Main automation workflow with checkpoint support
 * Processes all active users and their topics
 */
async function runAutomation(env: Env): Promise<AutomationResult> {
  const today = formatDate(new Date());
  const checkpointKey = `checkpoint:automation:${today}`;

  // Load or create checkpoint
  const checkpoint: Checkpoint = await loadCheckpoint(env, checkpointKey) || {
    date: today,
    users_processed: 0,
    papers_found: 0,
    papers_summarized: 0,
    papers_skipped: 0,
    papers_processed_this_run: 0,
    total_cost: 0,
    errors: [],
    completed: false
  };

  // Reset papers_processed_this_run for new execution
  checkpoint.papers_processed_this_run = 0;

  // If already completed today, skip
  if (checkpoint.completed) {
    console.log('[AUTOMATION] Already completed for today, skipping');
    return {
      batch_complete: true,
      total_complete: true,
      checkpoint
    };
  }

  // Get all active users
  const users = await env.DB
    .prepare('SELECT * FROM users WHERE is_active = 1 ORDER BY id')
    .all<User>();

  if (!users.results || users.results.length === 0) {
    console.log('[AUTOMATION] No active users found');
    checkpoint.completed = true;
    await saveCheckpoint(env, checkpointKey, checkpoint);
    return {
      batch_complete: true,
      total_complete: true,
      checkpoint
    };
  }

  console.log(`[AUTOMATION] Processing ${users.results.length} users (batch limit: ${BATCH_SIZE} papers)`);

  // Initialize clients
  const arxivClient = new ArxivClient();
  const summarizationClient = new SummarizationClient(env.CLAUDE_API_KEY);

  let batchExhausted = false;

  // Process each user
  for (const user of users.results) {
    // Skip if already processed (checkpoint resume) but not the last user we were working on
    if (checkpoint.last_user_id && user.id < checkpoint.last_user_id) {
      console.log(`[USER:${user.username}] Already processed, skipping`);
      continue;
    }

    // If resuming from this user, clear the last_paper_arxiv_id for fresh start on next user
    const resumeFromPaper = (checkpoint.last_user_id === user.id) ? checkpoint.last_paper_arxiv_id : undefined;

    try {
      console.log(`[USER:${user.username}] Starting processing...`);
      if (resumeFromPaper) {
        console.log(`[USER:${user.username}] Resuming from paper: ${resumeFromPaper}`);
      }

      const batchRemaining = BATCH_SIZE - checkpoint.papers_processed_this_run;
      const result = await processUser(
        env,
        user,
        arxivClient,
        summarizationClient,
        batchRemaining,
        resumeFromPaper
      );

      // Update checkpoint - only increment users_processed if we finished this user completely
      if (!result.batch_exhausted) {
        checkpoint.users_processed++;
        checkpoint.last_paper_arxiv_id = undefined; // Clear paper tracking when user is done
      } else {
        checkpoint.last_paper_arxiv_id = result.last_arxiv_id;
      }

      checkpoint.papers_found += result.papers_found;
      checkpoint.papers_summarized += result.papers_summarized;
      checkpoint.papers_skipped += result.papers_skipped;
      checkpoint.papers_processed_this_run += (result.papers_summarized + result.papers_skipped);
      checkpoint.total_cost += result.cost;
      checkpoint.last_user_id = user.id;

      await saveCheckpoint(env, checkpointKey, checkpoint);

      console.log(`[USER:${user.username}] Completed: ${result.papers_found} found, ${result.papers_summarized} summarized, ${result.papers_skipped} skipped, $${result.cost.toFixed(4)} cost`);

      // Check if batch is exhausted
      if (result.batch_exhausted) {
        console.log(`[BATCH] Batch limit reached (${BATCH_SIZE} papers processed this run)`);
        batchExhausted = true;
        break;
      }

      // Check budget circuit breaker
      if (checkpoint.total_cost >= 1.0) {
        console.warn('[BUDGET] Daily budget ($1.00) exceeded, stopping automation');
        checkpoint.errors.push(`Budget exceeded at $${checkpoint.total_cost.toFixed(4)}`);
        await saveCheckpoint(env, checkpointKey, checkpoint);
        break;
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[USER:${user.username}] Error:`, error);
      checkpoint.errors.push(`${user.username}: ${errorMsg}`);
      checkpoint.last_user_id = user.id; // Mark as processed even on error
      checkpoint.last_paper_arxiv_id = undefined; // Clear paper tracking on error
      await saveCheckpoint(env, checkpointKey, checkpoint);
      continue; // Continue with next user
    }
  }

  // Mark as completed only if we processed all users and didn't hit batch limit
  if (!batchExhausted) {
    checkpoint.completed = true;
    await saveCheckpoint(env, checkpointKey, checkpoint);
  }

  // Final summary
  console.log('[AUTOMATION] ===== SUMMARY =====');
  console.log(`[AUTOMATION] Users processed: ${checkpoint.users_processed}`);
  console.log(`[AUTOMATION] Papers found: ${checkpoint.papers_found}`);
  console.log(`[AUTOMATION] Papers summarized: ${checkpoint.papers_summarized}`);
  console.log(`[AUTOMATION] Papers skipped: ${checkpoint.papers_skipped}`);
  console.log(`[AUTOMATION] Papers this run: ${checkpoint.papers_processed_this_run}`);
  console.log(`[AUTOMATION] Total cost: $${checkpoint.total_cost.toFixed(4)}`);
  console.log(`[AUTOMATION] Batch exhausted: ${batchExhausted}`);
  console.log(`[AUTOMATION] Completed: ${checkpoint.completed}`);
  console.log(`[AUTOMATION] Errors: ${checkpoint.errors.length}`);
  if (checkpoint.errors.length > 0) {
    console.log('[AUTOMATION] Error details:', checkpoint.errors);
  }
  console.log('[AUTOMATION] ==================');

  // Send notification only when daily run completes (not per batch)
  if (checkpoint.completed && checkpoint.papers_summarized > 0) {
    await sendNotification(env, checkpoint);
  }

  // Cleanup old checkpoints (only if fully completed)
  if (checkpoint.completed) {
    await cleanupOldCheckpoints(env);
  }

  return {
    batch_complete: batchExhausted || checkpoint.completed,
    total_complete: checkpoint.completed,
    checkpoint
  };
}

// =============================================================================
// User Processing
// =============================================================================

/**
 * Process a single user: fetch topics, search arXiv, summarize, store
 */
async function processUser(
  env: Env,
  user: User,
  arxivClient: ArxivClient,
  summarizationClient: SummarizationClient,
  batchRemaining: number,
  resumeFromPaperId?: string
): Promise<UserProcessingResult> {

  // Get user's enabled topics
  const topics = await env.DB
    .prepare('SELECT * FROM topics WHERE user_id = ? AND enabled = 1')
    .bind(user.id)
    .all<Topic>();

  if (!topics.results || topics.results.length === 0) {
    console.log(`[USER:${user.username}] No enabled topics configured`);
    return {
      papers_found: 0,
      papers_summarized: 0,
      papers_skipped: 0,
      cost: 0,
      batch_exhausted: false
    };
  }

  console.log(`[USER:${user.username}] Processing ${topics.results.length} topics`);

  // Query each topic individually to avoid arXiv API errors from overly complex queries
  // Then deduplicate papers by arxiv_id
  const paperMap = new Map<string, { arxiv_id: string; title: string; authors: string; abstract: string; categories: string; published_date: string; pdf_url: string }>();

  for (const topic of topics.results) {
    try {
      console.log(`[USER:${user.username}] Querying topic: ${topic.topic_name}`);

      const topicPapers = await arxivClient.search({
        query: topic.arxiv_query,
        maxResults: 50, // Limit per topic to avoid rate limiting
        sortBy: 'submittedDate',
        sortOrder: 'descending'
      });

      console.log(`[USER:${user.username}] Topic "${topic.topic_name}" returned ${topicPapers.length} papers`);

      // Add to map (deduplicates automatically)
      for (const paper of topicPapers) {
        if (!paperMap.has(paper.arxiv_id)) {
          paperMap.set(paper.arxiv_id, paper);
        }
      }
    } catch (error) {
      console.error(`[USER:${user.username}] Error querying topic "${topic.topic_name}":`, error);
      // Continue with other topics even if one fails
    }
  }

  // Convert map to array, sorted by most recent first
  const papers = Array.from(paperMap.values())
    .sort((a, b) => new Date(b.published_date).getTime() - new Date(a.published_date).getTime());

  console.log(`[USER:${user.username}] Found ${papers.length} unique papers from arXiv (across all topics)`);

  let papersProcessed = 0;
  let papersSummarized = 0;
  let papersSkipped = 0;
  let totalCost = 0;
  let shouldSkip = resumeFromPaperId !== undefined;
  let lastArxivId: string | undefined;

  // Process each paper
  for (const paper of papers) {
    // Skip papers until we find the resume point
    if (shouldSkip) {
      if (paper.arxiv_id === resumeFromPaperId) {
        console.log(`[PAPER:${paper.arxiv_id}] Found resume point, continuing from next paper`);
        shouldSkip = false;
      }
      continue;
    }

    // Check batch limit BEFORE processing each paper
    if (papersProcessed >= batchRemaining) {
      console.log(`[USER:${user.username}] Batch limit reached, stopping at paper ${paper.arxiv_id}`);
      return {
        papers_found: papers.length,
        papers_summarized: papersSummarized,
        papers_skipped: papersSkipped,
        cost: totalCost,
        batch_exhausted: true,
        last_arxiv_id: lastArxivId
      };
    }

    try {
      lastArxivId = paper.arxiv_id;

      // Check if paper already exists in database
      const existing = await env.DB
        .prepare('SELECT id FROM papers WHERE arxiv_id = ?')
        .bind(paper.arxiv_id)
        .first();

      if (existing) {
        console.log(`[PAPER:${paper.arxiv_id}] Already exists in database, skipping`);

        // Create user_paper_status entry if it doesn't exist
        const userStatus = await env.DB
          .prepare('SELECT 1 FROM user_paper_status WHERE user_id = ? AND paper_id = ?')
          .bind(user.id, existing.id)
          .first();

        if (!userStatus) {
          await env.DB
            .prepare(`
              INSERT INTO user_paper_status
              (user_id, paper_id, explored, bookmarked, created_at)
              VALUES (?, ?, 0, 0, ?)
            `)
            .bind(user.id, existing.id, new Date().toISOString())
            .run();
          console.log(`[PAPER:${paper.arxiv_id}] Created user_paper_status entry`);
        }

        // Already existing papers count toward batch limit (they use time)
        papersProcessed++;
        continue;
      }

      // Summarize paper using two-stage AI
      const result = await summarizationClient.summarize(
        paper.title,
        paper.abstract,
        topicNames,
        0.5 // relevance threshold (lowered for testing)
      );

      totalCost += result.total_cost;

      // Skip if irrelevant (failed triage)
      if (!result.summary) {
        console.log(`[PAPER:${paper.arxiv_id}] Skipped (${result.skipped_reason})`);
        papersSkipped++;
        papersProcessed++;
        continue;
      }

      // Store paper in database with summary
      await env.DB
        .prepare(`
          INSERT INTO papers
          (arxiv_id, title, authors, abstract, categories, published_date,
           pdf_url, summary, summary_generated_at, summary_model,
           relevance_score, content_hash, collected_for_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          paper.arxiv_id,
          paper.title,
          paper.authors,
          paper.abstract,
          paper.categories,
          paper.published_date,
          paper.pdf_url,
          result.summary,
          new Date().toISOString(),
          CLAUDE_SONNET_MODEL,
          result.relevance_score,
          result.content_hash,
          user.id,
          new Date().toISOString()
        )
        .run();

      // Get the inserted paper ID
      const insertedPaper = await env.DB
        .prepare('SELECT id FROM papers WHERE arxiv_id = ?')
        .bind(paper.arxiv_id)
        .first<{ id: number }>();

      if (!insertedPaper) {
        throw new Error(`Failed to retrieve inserted paper ${paper.arxiv_id}`);
      }

      // Create user_paper_status entry
      await env.DB
        .prepare(`
          INSERT INTO user_paper_status
          (user_id, paper_id, explored, bookmarked, created_at)
          VALUES (?, ?, 0, 0, ?)
        `)
        .bind(user.id, insertedPaper.id, new Date().toISOString())
        .run();

      papersProcessed++;
      papersSummarized++;

      console.log(`[PAPER:${paper.arxiv_id}] Stored with summary (relevance: ${result.relevance_score.toFixed(2)})`);

    } catch (error) {
      console.error(`[PAPER:${paper.arxiv_id}] Error:`, error);
      // Continue processing other papers
      continue;
    }
  }

  return {
    papers_found: papers.length,
    papers_summarized: papersSummarized,
    papers_skipped: papersSkipped,
    cost: totalCost,
    batch_exhausted: false,
    last_arxiv_id: lastArxivId
  };
}

// =============================================================================
// Checkpoint Management
// =============================================================================

/**
 * Load checkpoint from KV storage
 */
async function loadCheckpoint(env: Env, key: string): Promise<Checkpoint | null> {
  try {
    const data = await env.CACHE.get(key);
    if (!data) return null;

    const checkpoint = JSON.parse(data) as Checkpoint;
    console.log(`[CHECKPOINT] Loaded: ${checkpoint.users_processed} users processed, $${checkpoint.total_cost.toFixed(4)} spent`);
    return checkpoint;
  } catch (error) {
    console.error('[CHECKPOINT] Failed to load:', error);
    return null;
  }
}

/**
 * Save checkpoint to KV storage
 */
async function saveCheckpoint(env: Env, key: string, checkpoint: Checkpoint): Promise<void> {
  try {
    await env.CACHE.put(key, JSON.stringify(checkpoint), {
      expirationTtl: 7 * 24 * 60 * 60 // 7 days TTL
    });
    console.log(`[CHECKPOINT] Saved: ${checkpoint.users_processed} users, $${checkpoint.total_cost.toFixed(4)} cost`);
  } catch (error) {
    console.error('[CHECKPOINT] Failed to save:', error);
  }
}

/**
 * Cleanup old checkpoints (older than 7 days)
 * KV automatically expires keys based on expirationTtl, but we can manually clean up if needed
 */
async function cleanupOldCheckpoints(env: Env): Promise<void> {
  // KV automatically expires keys after 7 days (set in expirationTtl)
  // No manual cleanup needed for now
  console.log('[CLEANUP] Old checkpoints will auto-expire after 7 days');
}

// =============================================================================
// Notifications (ntfy.sh)
// =============================================================================

/**
 * Send notification via ntfy.sh when new papers are found
 * Simple HTTP POST - no auth required, just pick a topic name
 *
 * @param env - Environment with NTFY_TOPIC and DB
 * @param checkpoint - Current checkpoint with paper counts
 */
async function sendNotification(env: Env, checkpoint: Checkpoint): Promise<void> {
  const topic = env.NTFY_TOPIC;
  if (!topic) {
    console.log('[NOTIFY] No NTFY_TOPIC configured, skipping notification');
    return;
  }

  try {
    // Fetch today's summarized paper titles from database
    const today = checkpoint.date;
    const papers = await env.DB
      .prepare(`
        SELECT title FROM papers
        WHERE summary IS NOT NULL
        AND DATE(created_at) = ?
        ORDER BY relevance_score DESC
        LIMIT 5
      `)
      .bind(today)
      .all<{ title: string }>();

    const title = `📄 ${checkpoint.papers_summarized} new paper${checkpoint.papers_summarized === 1 ? '' : 's'}`;

    // Build body with paper titles (truncated to fit 4KB limit)
    const bodyParts = [
      `Found ${checkpoint.papers_found} papers, ${checkpoint.papers_summarized} passed relevance filter`,
      '',
    ];

    if (papers.results.length > 0) {
      for (const paper of papers.results) {
        // Truncate long titles to ~80 chars
        const truncatedTitle = paper.title.length > 80
          ? paper.title.substring(0, 77) + '...'
          : paper.title;
        bodyParts.push(`• ${truncatedTitle}`);
      }
      if (checkpoint.papers_summarized > 5) {
        bodyParts.push(`...and ${checkpoint.papers_summarized - 5} more`);
      }
    }

    const response = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': checkpoint.papers_summarized >= 5 ? 'high' : 'default',
        'Tags': 'page_facing_up,mag',
      },
      body: bodyParts.join('\n'),
    });

    if (response.ok) {
      console.log(`[NOTIFY] Sent notification to ntfy.sh/${topic}`);
    } else {
      console.error(`[NOTIFY] Failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('[NOTIFY] Error sending notification:', error);
    // Don't throw - notification failure shouldn't break automation
  }
}

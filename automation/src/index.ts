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
  total_cost: number;              // Total AI cost in USD
  errors: string[];                // Array of error messages
  last_user_id?: number;           // Last successfully processed user ID (for resume)
  completed: boolean;              // True when all users processed
}

/**
 * Result from processing a single user
 */
interface UserProcessingResult {
  papers_found: number;
  papers_summarized: number;
  cost: number;
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
        await runAutomation(env);

        return new Response(JSON.stringify({
          success: true,
          message: 'Automation completed successfully',
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
async function runAutomation(env: Env): Promise<void> {
  const today = formatDate(new Date());
  const checkpointKey = `checkpoint:automation:${today}`;

  // Load or create checkpoint
  const checkpoint: Checkpoint = await loadCheckpoint(env, checkpointKey) || {
    date: today,
    users_processed: 0,
    papers_found: 0,
    papers_summarized: 0,
    total_cost: 0,
    errors: [],
    completed: false
  };

  // If already completed today, skip
  if (checkpoint.completed) {
    console.log('[AUTOMATION] Already completed for today, skipping');
    return;
  }

  // Get all active users
  const users = await env.DB
    .prepare('SELECT * FROM users WHERE is_active = 1 ORDER BY id')
    .all<User>();

  if (!users.results || users.results.length === 0) {
    console.log('[AUTOMATION] No active users found');
    checkpoint.completed = true;
    await saveCheckpoint(env, checkpointKey, checkpoint);
    return;
  }

  console.log(`[AUTOMATION] Processing ${users.results.length} users`);

  // Initialize clients
  const arxivClient = new ArxivClient();
  const summarizationClient = new SummarizationClient(env.CLAUDE_API_KEY);

  // Process each user
  for (const user of users.results) {
    // Skip if already processed (checkpoint resume)
    if (checkpoint.last_user_id && user.id <= checkpoint.last_user_id) {
      console.log(`[USER:${user.username}] Already processed, skipping`);
      continue;
    }

    try {
      console.log(`[USER:${user.username}] Starting processing...`);

      const result = await processUser(
        env,
        user,
        arxivClient,
        summarizationClient
      );

      // Update checkpoint
      checkpoint.users_processed++;
      checkpoint.papers_found += result.papers_found;
      checkpoint.papers_summarized += result.papers_summarized;
      checkpoint.total_cost += result.cost;
      checkpoint.last_user_id = user.id;

      await saveCheckpoint(env, checkpointKey, checkpoint);

      console.log(`[USER:${user.username}] Completed: ${result.papers_found} found, ${result.papers_summarized} summarized, $${result.cost.toFixed(4)} cost`);

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
      await saveCheckpoint(env, checkpointKey, checkpoint);
      continue; // Continue with next user
    }
  }

  // Mark as completed
  checkpoint.completed = true;
  await saveCheckpoint(env, checkpointKey, checkpoint);

  // Final summary
  console.log('[AUTOMATION] ===== SUMMARY =====');
  console.log(`[AUTOMATION] Users processed: ${checkpoint.users_processed}`);
  console.log(`[AUTOMATION] Papers found: ${checkpoint.papers_found}`);
  console.log(`[AUTOMATION] Papers summarized: ${checkpoint.papers_summarized}`);
  console.log(`[AUTOMATION] Total cost: $${checkpoint.total_cost.toFixed(4)}`);
  console.log(`[AUTOMATION] Errors: ${checkpoint.errors.length}`);
  if (checkpoint.errors.length > 0) {
    console.log('[AUTOMATION] Error details:', checkpoint.errors);
  }
  console.log('[AUTOMATION] ==================');

  // Cleanup old checkpoints
  await cleanupOldCheckpoints(env);
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
  summarizationClient: SummarizationClient
): Promise<UserProcessingResult> {

  // Get user's enabled topics
  const topics = await env.DB
    .prepare('SELECT * FROM topics WHERE user_id = ? AND enabled = 1')
    .bind(user.id)
    .all<Topic>();

  if (!topics.results || topics.results.length === 0) {
    console.log(`[USER:${user.username}] No enabled topics configured`);
    return { papers_found: 0, papers_summarized: 0, cost: 0 };
  }

  console.log(`[USER:${user.username}] Processing ${topics.results.length} topics`);

  // Build combined search query (OR all topics)
  const queryBuilder = new ArxivQueryBuilder();
  const topicNames: string[] = [];

  for (const topic of topics.results) {
    // Parse the arxiv_query to extract search terms
    // For now, we'll use the arxiv_query directly as it's already formatted
    topicNames.push(topic.topic_name);
  }

  // Combine all topic queries with OR
  const combinedQuery = topics.results
    .map(t => `(${t.arxiv_query})`)
    .join(' OR ');

  console.log(`[USER:${user.username}] Search query: ${combinedQuery}`);

  // Search arXiv for papers from last 24 hours
  const papers = await arxivClient.search({
    query: combinedQuery,
    maxResults: 100, // Process up to 100 papers per user per day
    sortBy: 'submittedDate',
    sortOrder: 'descending'
  });

  console.log(`[USER:${user.username}] Found ${papers.length} papers from arXiv`);

  let papersProcessed = 0;
  let papersSummarized = 0;
  let totalCost = 0;

  // Process each paper
  for (const paper of papers) {
    try {
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

        continue;
      }

      // Summarize paper using two-stage AI
      const result = await summarizationClient.summarize(
        paper.title,
        paper.abstract,
        topicNames,
        0.7 // relevance threshold
      );

      totalCost += result.total_cost;

      // Skip if irrelevant (failed triage)
      if (!result.summary) {
        console.log(`[PAPER:${paper.arxiv_id}] Skipped (${result.skipped_reason})`);
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
          'claude-3-5-sonnet-20241022',
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
    cost: totalCost
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

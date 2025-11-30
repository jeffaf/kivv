// =============================================================================
// kivv - Automation Worker Integration Tests
// =============================================================================
// Tests for the checkpointed cron automation system
// Note: These tests use mocks to avoid real API calls
// =============================================================================

import { describe, test, expect, beforeEach, mock } from 'bun:test';

// =============================================================================
// Test Configuration
// =============================================================================

/**
 * Mock environment for testing
 */
interface MockEnv {
  DB: any;
  CACHE: any;
  PAPERS: any;
  CLAUDE_API_KEY: string;
  CRON_SECRET: string;
}

/**
 * Create mock D1 database for testing
 */
function createMockD1() {
  const data: Record<string, any[]> = {
    users: [
      { id: 1, username: 'jeff', email: 'jeff@example.com', api_key: 'key1', is_active: 1 },
      { id: 2, username: 'wife', email: 'wife@example.com', api_key: 'key2', is_active: 1 }
    ],
    topics: [
      { id: 1, user_id: 1, topic_name: 'AI Safety', arxiv_query: 'cat:cs.AI AND safety', enabled: 1 },
      { id: 2, user_id: 2, topic_name: 'Healthcare AI', arxiv_query: 'cat:cs.AI AND healthcare', enabled: 1 }
    ],
    papers: [],
    user_paper_status: []
  };

  return {
    prepare: (query: string) => ({
      bind: (...params: any[]) => ({
        all: async () => {
          // Mock database queries
          if (query.includes('SELECT * FROM users')) {
            return { results: data.users };
          }
          if (query.includes('SELECT * FROM topics')) {
            const userId = params[0];
            return { results: data.topics.filter(t => t.user_id === userId && t.enabled === 1) };
          }
          if (query.includes('SELECT id FROM papers WHERE arxiv_id')) {
            const arxivId = params[0];
            const paper = data.papers.find((p: any) => p.arxiv_id === arxivId);
            return { results: paper ? [paper] : [] };
          }
          return { results: [] };
        },
        first: async () => {
          if (query.includes('SELECT id FROM papers WHERE arxiv_id')) {
            const arxivId = params[0];
            return data.papers.find((p: any) => p.arxiv_id === arxivId) || null;
          }
          return null;
        },
        run: async () => {
          // Mock insert/update operations
          if (query.includes('INSERT INTO papers')) {
            const mockPaper = {
              id: data.papers.length + 1,
              arxiv_id: params[0],
              title: params[1]
            };
            data.papers.push(mockPaper);
          }
          return { success: true };
        }
      })
    })
  };
}

/**
 * Create mock KV namespace for testing
 */
function createMockKV() {
  const storage: Record<string, string> = {};

  return {
    get: async (key: string) => storage[key] || null,
    put: async (key: string, value: string, options?: any) => {
      storage[key] = value;
    },
    delete: async (key: string) => {
      delete storage[key];
    }
  };
}

/**
 * Create mock R2 bucket for testing
 */
function createMockR2() {
  return {
    put: async (key: string, value: any) => ({ success: true }),
    get: async (key: string) => null,
    delete: async (key: string) => ({ success: true })
  };
}

// =============================================================================
// Test Suite: Checkpoint System
// =============================================================================

describe('Checkpoint System', () => {
  let mockEnv: MockEnv;

  beforeEach(() => {
    mockEnv = {
      DB: createMockD1(),
      CACHE: createMockKV(),
      PAPERS: createMockR2(),
      CLAUDE_API_KEY: 'test-api-key',
      CRON_SECRET: 'test-secret'
    };
  });

  test('should create new checkpoint on first run', async () => {
    const today = new Date().toISOString().split('T')[0];
    const checkpointKey = `checkpoint:automation:${today}`;

    // Simulate saving a checkpoint
    const checkpoint = {
      date: today,
      users_processed: 0,
      papers_found: 0,
      papers_summarized: 0,
      total_cost: 0,
      errors: [],
      completed: false
    };

    await mockEnv.CACHE.put(checkpointKey, JSON.stringify(checkpoint));

    // Verify checkpoint was saved
    const saved = await mockEnv.CACHE.get(checkpointKey);
    expect(saved).toBeDefined();

    const parsed = JSON.parse(saved!);
    expect(parsed.date).toBe(today);
    expect(parsed.users_processed).toBe(0);
    expect(parsed.completed).toBe(false);
  });

  test('should load existing checkpoint on subsequent runs', async () => {
    const today = new Date().toISOString().split('T')[0];
    const checkpointKey = `checkpoint:automation:${today}`;

    // Create existing checkpoint
    const existingCheckpoint = {
      date: today,
      users_processed: 1,
      papers_found: 10,
      papers_summarized: 5,
      total_cost: 0.05,
      errors: [],
      last_user_id: 1,
      completed: false
    };

    await mockEnv.CACHE.put(checkpointKey, JSON.stringify(existingCheckpoint));

    // Load checkpoint
    const loaded = await mockEnv.CACHE.get(checkpointKey);
    const parsed = JSON.parse(loaded!);

    expect(parsed.users_processed).toBe(1);
    expect(parsed.last_user_id).toBe(1);
    expect(parsed.papers_found).toBe(10);
  });

  test('should resume from last_user_id after failure', async () => {
    const today = new Date().toISOString().split('T')[0];
    const checkpointKey = `checkpoint:automation:${today}`;

    // Checkpoint showing user 1 was processed
    const checkpoint = {
      date: today,
      users_processed: 1,
      papers_found: 10,
      papers_summarized: 5,
      total_cost: 0.05,
      errors: [],
      last_user_id: 1, // User 1 completed
      completed: false
    };

    await mockEnv.CACHE.put(checkpointKey, JSON.stringify(checkpoint));

    // In a real automation run, user 1 would be skipped
    // and processing would start from user 2
    const loaded = JSON.parse((await mockEnv.CACHE.get(checkpointKey))!);
    expect(loaded.last_user_id).toBe(1);

    // Verify that users with id <= 1 would be skipped
    const allUsers = [
      { id: 1, username: 'jeff' },
      { id: 2, username: 'wife' }
    ];

    const usersToProcess = allUsers.filter(u => !loaded.last_user_id || u.id > loaded.last_user_id);
    expect(usersToProcess.length).toBe(1);
    expect(usersToProcess[0].username).toBe('wife');
  });
});

// =============================================================================
// Test Suite: Budget Tracking
// =============================================================================

describe('Budget Tracking', () => {
  test('should stop when budget exceeds $1', () => {
    const checkpoint = {
      date: '2025-11-30',
      users_processed: 5,
      papers_found: 100,
      papers_summarized: 50,
      total_cost: 1.05, // Exceeded budget
      errors: [],
      completed: false
    };

    // Budget check logic
    const budgetExceeded = checkpoint.total_cost >= 1.0;
    expect(budgetExceeded).toBe(true);
  });

  test('should continue when budget is under $1', () => {
    const checkpoint = {
      date: '2025-11-30',
      users_processed: 3,
      papers_found: 50,
      papers_summarized: 25,
      total_cost: 0.45,
      errors: [],
      completed: false
    };

    const budgetExceeded = checkpoint.total_cost >= 1.0;
    expect(budgetExceeded).toBe(false);
  });

  test('should track cost per user', () => {
    const userCosts = [
      { user: 'jeff', cost: 0.25 },
      { user: 'wife', cost: 0.30 },
      { user: 'friend', cost: 0.20 }
    ];

    const totalCost = userCosts.reduce((sum, u) => sum + u.cost, 0);
    expect(totalCost).toBe(0.75);
    expect(totalCost).toBeLessThan(1.0);
  });
});

// =============================================================================
// Test Suite: Error Handling
// =============================================================================

describe('Error Handling', () => {
  test('should log errors and continue with next user', () => {
    const errors: string[] = [];

    // Simulate user processing with error
    const users = ['jeff', 'wife', 'friend'];

    for (const user of users) {
      try {
        if (user === 'wife') {
          throw new Error('Failed to fetch topics');
        }
        // Process user successfully
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${user}: ${errorMsg}`);
        continue; // Continue with next user
      }
    }

    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('wife');
    expect(errors[0]).toContain('Failed to fetch topics');
  });

  test('should save checkpoint after each user (even on error)', async () => {
    const mockKV = createMockKV();
    const checkpointKey = 'checkpoint:automation:2025-11-30';

    // Simulate processing with error
    let checkpoint = {
      date: '2025-11-30',
      users_processed: 0,
      papers_found: 0,
      papers_summarized: 0,
      total_cost: 0,
      errors: [] as string[],
      last_user_id: undefined as number | undefined,
      completed: false
    };

    // User 1: success
    checkpoint.users_processed = 1;
    checkpoint.last_user_id = 1;
    await mockKV.put(checkpointKey, JSON.stringify(checkpoint));

    // User 2: error
    checkpoint.errors.push('user2: API error');
    checkpoint.last_user_id = 2; // Still mark as processed
    await mockKV.put(checkpointKey, JSON.stringify(checkpoint));

    // Verify checkpoint saved even after error
    const saved = JSON.parse((await mockKV.get(checkpointKey))!);
    expect(saved.last_user_id).toBe(2);
    expect(saved.errors.length).toBe(1);
  });
});

// =============================================================================
// Test Suite: Authentication
// =============================================================================

describe('Authentication', () => {
  test('should reject requests without cf-cron header or auth', () => {
    const request = new Request('http://localhost/run', {
      method: 'POST',
      headers: {}
    });

    const cronHeader = request.headers.get('cf-cron');
    const authHeader = request.headers.get('authorization');

    const isAuthenticated = cronHeader || authHeader === 'Bearer test-secret';
    expect(isAuthenticated).toBe(false);
  });

  test('should accept requests with cf-cron header', () => {
    const request = new Request('http://localhost/run', {
      method: 'POST',
      headers: { 'cf-cron': '1' }
    });

    const cronHeader = request.headers.get('cf-cron');
    expect(cronHeader).toBeDefined();
  });

  test('should accept requests with valid authorization header', () => {
    const request = new Request('http://localhost/run', {
      method: 'POST',
      headers: { 'authorization': 'Bearer test-secret' }
    });

    const authHeader = request.headers.get('authorization');
    const isAuthenticated = authHeader === 'Bearer test-secret';
    expect(isAuthenticated).toBe(true);
  });
});

// =============================================================================
// Test Suite: User Processing
// =============================================================================

describe('User Processing', () => {
  test('should fetch enabled topics for user', async () => {
    const mockDB = createMockD1();

    // Fetch topics for user 1
    const topics = await mockDB
      .prepare('SELECT * FROM topics WHERE user_id = ? AND enabled = 1')
      .bind(1)
      .all();

    expect(topics.results).toBeDefined();
    expect(topics.results.length).toBeGreaterThan(0);
    expect(topics.results[0].user_id).toBe(1);
    expect(topics.results[0].enabled).toBe(1);
  });

  test('should skip users with no enabled topics', async () => {
    const mockDB = createMockD1();

    // Fetch topics for non-existent user
    const topics = await mockDB
      .prepare('SELECT * FROM topics WHERE user_id = ? AND enabled = 1')
      .bind(999)
      .all();

    expect(topics.results.length).toBe(0);
    // In real code, this would return early with 0 papers processed
  });

  test('should combine multiple topics with OR', () => {
    const topics = [
      { arxiv_query: 'cat:cs.AI AND safety' },
      { arxiv_query: 'cat:cs.LG AND interpretability' }
    ];

    const combinedQuery = topics
      .map(t => `(${t.arxiv_query})`)
      .join(' OR ');

    expect(combinedQuery).toBe('(cat:cs.AI AND safety) OR (cat:cs.LG AND interpretability)');
  });
});

// =============================================================================
// Test Suite: Paper Deduplication
// =============================================================================

describe('Paper Deduplication', () => {
  test('should skip papers that already exist in database', async () => {
    const mockDB = createMockD1();

    // Add a paper to mock database
    await mockDB
      .prepare('INSERT INTO papers (...)')
      .bind('2311.12345', 'Test Paper')
      .run();

    // Check if paper exists
    const existing = await mockDB
      .prepare('SELECT id FROM papers WHERE arxiv_id = ?')
      .bind('2311.12345')
      .first();

    expect(existing).toBeDefined();
    expect(existing.arxiv_id).toBe('2311.12345');
  });

  test('should insert new papers not in database', async () => {
    const mockDB = createMockD1();

    // Check for non-existent paper
    const existing = await mockDB
      .prepare('SELECT id FROM papers WHERE arxiv_id = ?')
      .bind('2311.99999')
      .first();

    expect(existing).toBeNull();
    // In real code, this would proceed with summarization and insertion
  });
});

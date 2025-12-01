// =============================================================================
// kivv - Summarization Client Unit Tests
// =============================================================================
// Tests for two-stage AI summarization with cost optimization
// Covers: rate limiting, triage, summaries, cost tracking, error handling
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
const mock = vi.fn;
import { SummarizationClient } from '../../shared/summarization';
import {
  ANTHROPIC_RATE_LIMIT_MS,
  ANTHROPIC_JITTER_MIN_MS,
  DAILY_BUDGET_CAP_USD,
  DEFAULT_RELEVANCE_THRESHOLD,
} from '../../shared/constants';

// =============================================================================
// Mock Anthropic API
// =============================================================================

/**
 * Mock Anthropic API response for Haiku triage
 */
function mockHaikuResponse(score: number) {
  return {
    id: 'msg_haiku_123',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: score.toString(),
      },
    ],
    model: 'claude-3-5-haiku-20241022',
    usage: {
      input_tokens: 150,
      output_tokens: 3,
    },
  };
}

/**
 * Mock Anthropic API response for Sonnet summary
 */
function mockSonnetResponse(summary: string) {
  return {
    id: 'msg_sonnet_456',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: summary,
      },
    ],
    model: 'claude-3-5-sonnet-20241022',
    usage: {
      input_tokens: 200,
      output_tokens: 80,
    },
  };
}

/**
 * Mock fetch globally for tests
 */
function mockFetch(responses: any[]) {
  let callCount = 0;
  globalThis.fetch = mock((url: string, options?: any) => {
    const response = responses[callCount++] || responses[responses.length - 1];
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
    } as Response);
  });
}

/**
 * Mock fetch to return error
 */
function mockFetchError(status: number, statusText: string) {
  globalThis.fetch = mock((url: string, options?: any) => {
    return Promise.resolve({
      ok: false,
      status,
      statusText,
      text: () => Promise.resolve(`Error: ${statusText}`),
    } as Response);
  });
}

// =============================================================================
// Test Suite
// =============================================================================

describe('SummarizationClient', () => {
  let client: SummarizationClient;

  beforeEach(() => {
    client = new SummarizationClient('test-api-key-12345');
  });

  // ===========================================================================
  // Rate Limiting Tests
  // ===========================================================================

  describe('Rate Limiting', () => {
    it('enforces minimum delay between requests', async () => {
      // Mock two Haiku calls (triage only, both irrelevant)
      mockFetch([mockHaikuResponse(0.3), mockHaikuResponse(0.2)]);

      const title = 'Test Paper';
      const abstract = 'Test abstract';
      const topics = ['AI'];

      const start = Date.now();

      // Make two summarization calls
      await client.summarize(title, abstract, topics);
      await client.summarize(title, abstract, topics);

      const elapsed = Date.now() - start;

      // Should take at least RATE_LIMIT_MS (200ms) between requests
      // Plus jitter (50-100ms) = minimum ~250ms
      expect(elapsed).toBeGreaterThanOrEqual(ANTHROPIC_RATE_LIMIT_MS);
    });

    it('adds jitter to rate limiting', async () => {
      // Mock multiple Haiku calls
      mockFetch([
        mockHaikuResponse(0.3),
        mockHaikuResponse(0.2),
        mockHaikuResponse(0.4),
      ]);

      const title = 'Test Paper';
      const abstract = 'Test abstract';
      const topics = ['AI'];

      const delays: number[] = [];
      let lastTime = Date.now();

      // Make three calls and measure delays
      for (let i = 0; i < 3; i++) {
        await client.summarize(title, abstract, topics);
        const now = Date.now();
        if (i > 0) {
          delays.push(now - lastTime);
        }
        lastTime = now;
      }

      // All delays should be >= RATE_LIMIT_MS + JITTER_MIN_MS
      const minDelay = ANTHROPIC_RATE_LIMIT_MS + ANTHROPIC_JITTER_MIN_MS;
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(minDelay - 10); // -10ms tolerance
      }

      // Delays should vary (jitter working)
      const uniqueDelays = new Set(delays.map((d) => Math.floor(d / 10)));
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  // ===========================================================================
  // Triage Tests (Stage 1: Haiku)
  // ===========================================================================

  describe('Stage 1: Haiku Triage', () => {
    it('returns relevance score between 0-1', async () => {
      mockFetch([mockHaikuResponse(0.85)]);

      const result = await client.summarize(
        'Machine Learning Paper',
        'This paper discusses neural networks',
        ['machine learning', 'AI']
      );

      expect(result.relevance_score).toBe(0.85);
      expect(result.relevance_score).toBeGreaterThanOrEqual(0);
      expect(result.relevance_score).toBeLessThanOrEqual(1);
    });

    it('handles invalid scores by defaulting to 0.5', async () => {
      mockFetch([
        {
          ...mockHaikuResponse(0),
          content: [{ type: 'text', text: 'invalid' }],
        },
      ]);

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.relevance_score).toBe(0.5);
    });

    it('calculates Haiku cost correctly', async () => {
      mockFetch([mockHaikuResponse(0.4)]);

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      // Haiku: 150 input tokens * $0.25/1M = $0.0000375
      //        3 output tokens * $1.25/1M = $0.00000375
      const expectedHaikuCost = 150 * (0.25 / 1_000_000) + 3 * (1.25 / 1_000_000);

      expect(result.haiku_cost).toBeCloseTo(expectedHaikuCost, 8);
    });

    it('skips Sonnet for irrelevant papers (score < threshold)', async () => {
      mockFetch([mockHaikuResponse(0.5)]); // Below default 0.7 threshold

      const result = await client.summarize(
        'Irrelevant Paper',
        'Not related to topics',
        ['machine learning']
      );

      expect(result.summary).toBeNull();
      expect(result.skipped_reason).toBe('irrelevant');
      expect(result.sonnet_cost).toBe(0);
      expect(result.total_cost).toBe(result.haiku_cost);
    });
  });

  // ===========================================================================
  // Summary Tests (Stage 2: Sonnet)
  // ===========================================================================

  describe('Stage 2: Sonnet Summary', () => {
    it('generates summary for relevant papers (score >= threshold)', async () => {
      const summary =
        'This paper addresses the problem of X. The authors propose method Y. Results show improvement Z.';

      mockFetch([mockHaikuResponse(0.9), mockSonnetResponse(summary)]);

      const result = await client.summarize(
        'Relevant Paper',
        'Highly relevant abstract',
        ['machine learning']
      );

      expect(result.summary).toBe(summary);
      expect(result.relevance_score).toBe(0.9);
      expect(result.skipped_reason).toBeUndefined();
    });

    it('calculates Sonnet cost correctly', async () => {
      mockFetch([
        mockHaikuResponse(0.85),
        mockSonnetResponse('Summary sentence 1. Summary sentence 2. Summary sentence 3.'),
      ]);

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      // Sonnet: 200 input tokens * $3/1M = $0.0006
      //         80 output tokens * $15/1M = $0.0012
      const expectedSonnetCost = 200 * (3.0 / 1_000_000) + 80 * (15.0 / 1_000_000);

      expect(result.sonnet_cost).toBeCloseTo(expectedSonnetCost, 8);
    });

    it('calculates total cost correctly (haiku + sonnet)', async () => {
      mockFetch([
        mockHaikuResponse(0.8),
        mockSonnetResponse('Summary.'),
      ]);

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.total_cost).toBeCloseTo(
        result.haiku_cost + result.sonnet_cost,
        8
      );
      expect(result.total_cost).toBeGreaterThan(result.haiku_cost);
    });

    it('respects custom relevance threshold', async () => {
      mockFetch([mockHaikuResponse(0.6)]);

      // With custom threshold of 0.5, score 0.6 should trigger Sonnet
      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI'],
        0.5 // Custom threshold
      );

      // Should NOT skip (score >= threshold)
      expect(result.skipped_reason).toBeUndefined();
    });
  });

  // ===========================================================================
  // Two-Stage Pipeline Tests
  // ===========================================================================

  describe('Two-Stage Pipeline', () => {
    it('executes full pipeline for relevant papers', async () => {
      const summary = 'Problem. Method. Results.';
      mockFetch([mockHaikuResponse(0.92), mockSonnetResponse(summary)]);

      const result = await client.summarize(
        'Attention Is All You Need',
        'We propose a new architecture based solely on attention mechanisms',
        ['transformers', 'attention', 'NLP']
      );

      expect(result.relevance_score).toBe(0.92);
      expect(result.summary).toBe(summary);
      expect(result.haiku_cost).toBeGreaterThan(0);
      expect(result.sonnet_cost).toBeGreaterThan(0);
      expect(result.total_cost).toBeGreaterThan(0);
      expect(result.skipped_reason).toBeUndefined();
    });

    it('skips Sonnet for low-scoring papers', async () => {
      mockFetch([mockHaikuResponse(0.2)]);

      const result = await client.summarize(
        'Unrelated Biology Paper',
        'Study of plant cells',
        ['machine learning', 'AI']
      );

      expect(result.relevance_score).toBe(0.2);
      expect(result.summary).toBeNull();
      expect(result.haiku_cost).toBeGreaterThan(0);
      expect(result.sonnet_cost).toBe(0);
      expect(result.skipped_reason).toBe('irrelevant');
    });

    it('generates content hash for all papers', async () => {
      mockFetch([mockHaikuResponse(0.3)]);

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.content_hash).toBeDefined();
      expect(result.content_hash.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it('generates consistent hash for same content', async () => {
      mockFetch([mockHaikuResponse(0.3), mockHaikuResponse(0.3)]);

      const result1 = await client.summarize(
        'Same Paper',
        'Same abstract',
        ['AI']
      );

      const result2 = await client.summarize(
        'Same Paper',
        'Same abstract',
        ['AI']
      );

      expect(result1.content_hash).toBe(result2.content_hash);
    });

    it('generates different hash for different content', async () => {
      mockFetch([mockHaikuResponse(0.3), mockHaikuResponse(0.3)]);

      const result1 = await client.summarize(
        'Paper A',
        'Abstract A',
        ['AI']
      );

      const result2 = await client.summarize(
        'Paper B',
        'Abstract B',
        ['AI']
      );

      expect(result1.content_hash).not.toBe(result2.content_hash);
    });
  });

  // ===========================================================================
  // Budget Tracking Tests
  // ===========================================================================

  describe('Budget Tracking', () => {
    it('tracks total cost across multiple calls', async () => {
      mockFetch([
        mockHaikuResponse(0.3),
        mockHaikuResponse(0.4),
        mockHaikuResponse(0.2),
      ]);

      await client.summarize('Paper 1', 'Abstract 1', ['AI']);
      await client.summarize('Paper 2', 'Abstract 2', ['AI']);
      await client.summarize('Paper 3', 'Abstract 3', ['AI']);

      const totalCost = client.getTotalCost();
      expect(totalCost).toBeGreaterThan(0);
    });

    it('stops processing when budget exceeded', async () => {
      // Create a client and manually set cost to exceed budget
      const budgetClient = new SummarizationClient('test-key');

      // Mock high-cost responses to exceed $1 budget
      mockFetch([mockHaikuResponse(0.3)]);

      // Manually set total cost to exceed budget
      (budgetClient as any).totalCost = DAILY_BUDGET_CAP_USD + 0.01;

      const result = await budgetClient.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.summary).toBeNull();
      expect(result.skipped_reason).toBe('budget_exceeded');
      expect(result.haiku_cost).toBe(0);
      expect(result.sonnet_cost).toBe(0);
    });

    it('isBudgetExceeded returns true when over limit', () => {
      (client as any).totalCost = DAILY_BUDGET_CAP_USD + 0.01;
      expect(client.isBudgetExceeded()).toBe(true);
    });

    it('isBudgetExceeded returns false when under limit', () => {
      (client as any).totalCost = 0.5;
      expect(client.isBudgetExceeded()).toBe(false);
    });

    it('getRemainingBudget returns correct value', () => {
      (client as any).totalCost = 0.3;
      const remaining = client.getRemainingBudget();
      expect(remaining).toBeCloseTo(DAILY_BUDGET_CAP_USD - 0.3, 2);
    });

    it('getRemainingBudget returns 0 when budget exceeded', () => {
      (client as any).totalCost = DAILY_BUDGET_CAP_USD + 0.5;
      const remaining = client.getRemainingBudget();
      expect(remaining).toBe(0);
    });

    it('resetCost clears accumulated cost', async () => {
      mockFetch([mockHaikuResponse(0.3)]);

      await client.summarize('Test Paper', 'Test abstract', ['AI']);
      expect(client.getTotalCost()).toBeGreaterThan(0);

      client.resetCost();
      expect(client.getTotalCost()).toBe(0);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      mockFetchError(500, 'Internal Server Error');

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.summary).toBeNull();
      expect(result.skipped_reason).toBe('error');
      expect(result.haiku_cost).toBe(0);
      expect(result.sonnet_cost).toBe(0);
      expect(result.total_cost).toBe(0);
    });

    it('handles rate limit errors', async () => {
      mockFetchError(429, 'Too Many Requests');

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.summary).toBeNull();
      expect(result.skipped_reason).toBe('error');
    });

    it('handles authentication errors', async () => {
      mockFetchError(401, 'Unauthorized');

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.summary).toBeNull();
      expect(result.skipped_reason).toBe('error');
    });

    it('returns content hash even on error', async () => {
      mockFetchError(500, 'Internal Server Error');

      const result = await client.summarize(
        'Test Paper',
        'Test abstract',
        ['AI']
      );

      expect(result.content_hash).toBeDefined();
      expect(result.content_hash.length).toBe(64);
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('Integration Tests', () => {
    it('handles realistic paper summarization flow', async () => {
      const title = 'BERT: Pre-training of Deep Bidirectional Transformers';
      const abstract = 'We introduce a new language representation model called BERT...';
      const summary = 'BERT addresses masked language modeling. The method uses bidirectional transformers. Results show SOTA performance on 11 NLP tasks.';

      mockFetch([mockHaikuResponse(0.95), mockSonnetResponse(summary)]);

      const result = await client.summarize(
        title,
        abstract,
        ['NLP', 'transformers', 'language models']
      );

      // Verify complete result structure
      expect(result.summary).toBe(summary);
      expect(result.relevance_score).toBe(0.95);
      expect(result.content_hash).toBeDefined();
      expect(result.haiku_cost).toBeGreaterThan(0);
      expect(result.sonnet_cost).toBeGreaterThan(0);
      expect(result.total_cost).toBeCloseTo(
        result.haiku_cost + result.sonnet_cost,
        8
      );
      expect(result.skipped_reason).toBeUndefined();
    });

    it('handles batch processing with cost accumulation', async () => {
      // Simulate processing multiple papers
      mockFetch([
        mockHaikuResponse(0.2), // Paper 1: irrelevant
        mockHaikuResponse(0.9), // Paper 2: relevant
        mockSonnetResponse('Summary for paper 2.'),
        mockHaikuResponse(0.3), // Paper 3: irrelevant
        mockHaikuResponse(0.85), // Paper 4: relevant
        mockSonnetResponse('Summary for paper 4.'),
      ]);

      const papers = [
        { title: 'Paper 1', abstract: 'Abstract 1' },
        { title: 'Paper 2', abstract: 'Abstract 2' },
        { title: 'Paper 3', abstract: 'Abstract 3' },
        { title: 'Paper 4', abstract: 'Abstract 4' },
      ];

      const results = [];
      for (const paper of papers) {
        const result = await client.summarize(
          paper.title,
          paper.abstract,
          ['AI', 'ML']
        );
        results.push(result);
      }

      // Verify results
      expect(results[0].summary).toBeNull(); // Irrelevant
      expect(results[1].summary).toBeDefined(); // Relevant
      expect(results[2].summary).toBeNull(); // Irrelevant
      expect(results[3].summary).toBeDefined(); // Relevant

      // Verify cost accumulation
      const totalCost = client.getTotalCost();
      expect(totalCost).toBeGreaterThan(0);

      // 4 Haiku calls + 2 Sonnet calls
      const expectedCost =
        results.reduce((sum, r) => sum + r.haiku_cost, 0) +
        results.reduce((sum, r) => sum + r.sonnet_cost, 0);
      expect(totalCost).toBeCloseTo(expectedCost, 8);
    });
  });
});

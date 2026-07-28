import { describe, expect, it, vi } from 'vitest';
import { processUser } from '../../automation/src/index';
import type { ArxivClient, ArxivPaper } from '../../shared/arxiv-client';
import type { SummarizationClient, SummarizationResult } from '../../shared/summarization';
import type { Env, Topic, User } from '../../shared/types';

const USER: User = {
  id: 1,
  username: 'jeff',
  email: 'jeff@example.com',
  api_key: 'test-key',
  display_name: 'Jeff',
  created_at: '2026-07-28T00:00:00Z',
  last_login: null,
  is_active: true,
};

function topic(
  id: number,
  name: string,
  threshold: number,
  generateSummaries = true
): Topic {
  return {
    id,
    user_id: USER.id,
    topic_name: name,
    arxiv_query: `query-${id}`,
    enabled: true,
    relevance_threshold: threshold,
    max_papers_per_day: 20,
    generate_summaries: generateSummaries,
    created_at: '2026-07-28T00:00:00Z',
    last_collection_at: null,
    last_cursor: null,
  };
}

function paper(id: string, published = '2026-07-28T00:00:00Z'): ArxivPaper {
  return {
    arxiv_id: id,
    title: `Paper ${id}`,
    authors: 'Researcher',
    abstract: `Abstract for ${id}`,
    published_date: published,
    arxiv_url: `https://arxiv.org/abs/${id}`,
    pdf_url: `https://arxiv.org/pdf/${id}`,
    categories: 'cs.CR',
  };
}

function checkpoint() {
  return {
    date: '2026-07-28',
    users_processed: 0,
    papers_found: 0,
    papers_summarized: 0,
    papers_skipped: 0,
    papers_processed_this_run: 0,
    total_cost: 0,
    errors: [],
    completed: false,
  };
}

function fakeEnv(topics: Topic[]) {
  let insertedPaperId: number | null = null;

  const prepare = vi.fn((sql: string) => ({
    bind: (..._args: unknown[]) => ({
      all: async () => {
        if (sql.includes('FROM topics')) {
          return { results: topics };
        }
        throw new Error(`Unexpected all() query: ${sql}`);
      },
      first: async () => {
        if (sql.includes('SELECT id FROM papers')) {
          return insertedPaperId === null ? null : { id: insertedPaperId };
        }
        throw new Error(`Unexpected first() query: ${sql}`);
      },
      run: async () => {
        if (sql.includes('INSERT INTO papers')) {
          insertedPaperId = 101;
        }
        return { success: true };
      },
    }),
  }));

  return {
    env: {
      DB: { prepare },
      CACHE: {},
      PAPERS: {},
      CLAUDE_API_KEY: 'test-key',
      D1_DATABASE_ID: 'test-db',
      KV_NAMESPACE_ID: 'test-kv',
      R2_BUCKET_NAME: 'test-r2',
    } as unknown as Env,
    prepare,
  };
}

function summarizationResult(
  overrides: Partial<SummarizationResult> = {}
): SummarizationResult {
  return {
    summary: 'Problem. Method. Result.',
    relevance_score: 0.9,
    content_hash: 'hash',
    haiku_cost: 0.001,
    sonnet_cost: 0.002,
    total_cost: 0.003,
    ...overrides,
  };
}

describe('processUser recovery behavior', () => {
  it('queries every topic and scores a deduplicated paper only against its matches', async () => {
    const topics = [
      topic(21, 'Offensive Security & Vulnerability Research', 0.6),
      topic(26, 'Windows, Endpoint & Driver Security', 0.9),
    ];
    const sharedPaper = paper('2607.12345');
    const search = vi.fn(async (_params: { maxResults?: number }) => [sharedPaper]);
    const summarize = vi.fn(
      async (
        _title: string,
        _abstract: string,
        _topics: string[],
        _threshold?: number,
        _currentTotalCost?: number
      ) => summarizationResult()
    );
    const { env } = fakeEnv(topics);

    const result = await processUser(
      env,
      USER,
      { search } as unknown as ArxivClient,
      { summarize } as unknown as SummarizationClient,
      20,
      checkpoint()
    );

    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls.map(([params]) => params.maxResults)).toEqual([10, 10]);
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize.mock.calls[0][2]).toEqual([
      'Offensive Security & Vulnerability Research',
      'Windows, Endpoint & Driver Security',
    ]);
    expect(summarize.mock.calls[0][3]).toBe(0.75);
    expect(result.papers_found).toBe(1);
    expect(result.papers_summarized).toBe(1);
    expect(result.processing_unavailable).toBe(false);
  });

  it('reports processing unavailable when every new paper fails summarization', async () => {
    const topics = [topic(21, 'Offensive Security & Vulnerability Research', 0.75)];
    const search = vi.fn(async (_params: { maxResults?: number }) => [
      paper('2607.10001', '2026-07-28T02:00:00Z'),
      paper('2607.10002', '2026-07-28T01:00:00Z'),
    ]);
    const summarize = vi.fn(
      async (
        _title: string,
        _abstract: string,
        _topics: string[],
        _threshold?: number,
        _currentTotalCost?: number
      ) =>
        summarizationResult({
          summary: null,
          relevance_score: 0,
          haiku_cost: 0,
          sonnet_cost: 0,
          total_cost: 0,
          skipped_reason: 'error',
          error: 'Anthropic model unavailable',
        })
    );
    const { env } = fakeEnv(topics);

    const result = await processUser(
      env,
      USER,
      { search } as unknown as ArxivClient,
      { summarize } as unknown as SummarizationClient,
      20,
      checkpoint()
    );

    expect(summarize).toHaveBeenCalledTimes(2);
    expect(result.papers_found).toBe(2);
    expect(result.papers_summarized).toBe(0);
    expect(result.papers_skipped).toBe(2);
    expect(result.processing_unavailable).toBe(true);
    expect(result.query_errors).toEqual([
      'jeff/2607.10001: Anthropic model unavailable',
      'jeff/2607.10002: Anthropic model unavailable',
    ]);
  });
});

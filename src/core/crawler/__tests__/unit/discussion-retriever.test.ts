import { describe, it, expect } from 'vitest';
import {
  MockDiscussionRetriever,
  DomainInsightsRetriever,
  getDefaultDiscussionRetriever,
} from '../../discussion-retriever';
import { CrawledPage } from '../../types';

describe('discussion-retriever', () => {
  it('MockDiscussionRetriever returns deterministic structured snippets', async () => {
    const retriever = new MockDiscussionRetriever();
    const snippets = await retriever.retrieveDiscussions('Stripe', 'stripe.com', []);

    expect(snippets.length).toBe(2);
    expect(snippets[0].snippet).toContain('Stripe');
    expect(snippets[0].sentiment).toBe('positive');
  });

  it('MockDiscussionRetriever returns custom snippets when provided', async () => {
    const custom = [{ source: 'Custom', snippet: 'Test snippet', sentiment: 'neutral' as const }];
    const retriever = new MockDiscussionRetriever(custom);
    const snippets = await retriever.retrieveDiscussions('Test', 'test.com', []);

    expect(snippets).toEqual(custom);
  });

  it('DomainInsightsRetriever extracts interview and hiring paragraphs from crawled pages', async () => {
    const retriever = new DomainInsightsRetriever();
    const mockPages: CrawledPage[] = [
      {
        url: 'https://gitlab.com/handbook/hiring',
        title: 'GitLab Hiring Handbook',
        cleanText:
          'Welcome to GitLab.\n\nOur hiring process includes a screening call, a technical assessment, and an executive interview with team leads.\n\nWe value results and transparency.',
        headings: ['Hiring Handbook'],
        wordCount: 30,
        depth: 1,
        statusCode: 200,
      },
    ];

    const snippets = await retriever.retrieveDiscussions('GitLab', 'gitlab.com', mockPages);
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].snippet).toContain('screening call, a technical assessment');
    expect(snippets[0].url).toBe('https://gitlab.com/handbook/hiring');
  });

  it('DomainInsightsRetriever returns empty array when no relevant keywords exist', async () => {
    const retriever = new DomainInsightsRetriever();
    const mockPages: CrawledPage[] = [
      {
        url: 'https://example.com/terms',
        title: 'Terms of Service',
        cleanText: 'All rights reserved. Unauthorized copying or redistribution is prohibited by law.',
        headings: ['Terms'],
        wordCount: 15,
        depth: 0,
        statusCode: 200,
      },
    ];

    const snippets = await retriever.retrieveDiscussions('Example', 'example.com', mockPages);
    expect(snippets).toEqual([]);
  });

  it('getDefaultDiscussionRetriever returns MockDiscussionRetriever in test environment', () => {
    const retriever = getDefaultDiscussionRetriever();
    expect(retriever.name).toBe('MockDiscussionRetriever');
  });
});

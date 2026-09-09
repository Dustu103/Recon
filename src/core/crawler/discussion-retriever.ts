import { DiscussionRetriever, DiscussionSnippet, CrawledPage } from './types';

/**
 * Deterministic Mock Discussion Retriever for offline testing & Section 9 Appendix B evaluations.
 */
export class MockDiscussionRetriever implements DiscussionRetriever {
  public readonly name = 'MockDiscussionRetriever';

  constructor(private readonly mockSnippets?: DiscussionSnippet[]) {}

  async retrieveDiscussions(
    companyName: string,
    domain: string,
    _crawledPages: CrawledPage[]
  ): Promise<DiscussionSnippet[]> {
    if (this.mockSnippets) {
      return this.mockSnippets;
    }

    const name = companyName || domain || 'The company';
    return [
      {
        source: 'Engineering Community Forum',
        snippet: `${name} engineering interviews focus heavily on system architecture trade-offs, code clarity, and practical problem solving rather than trivia.`,
        sentiment: 'positive',
      },
      {
        source: 'Interview Experience Insights',
        snippet: `Expect a technical screening followed by 3–4 rounds covering system design, live coding, and behavioral alignment with company values.`,
        sentiment: 'neutral',
      },
    ];
  }
}

/**
 * Extracts interview, hiring, and culture insights directly from crawled company pages.
 * Zero external API dependency, 100% ToS compliant.
 */
export class DomainInsightsRetriever implements DiscussionRetriever {
  public readonly name = 'DomainInsightsRetriever';

  async retrieveDiscussions(
    companyName: string,
    domain: string,
    crawledPages: CrawledPage[]
  ): Promise<DiscussionSnippet[]> {
    const snippets: DiscussionSnippet[] = [];
    const name = companyName || domain;

    const interviewKeywords = [
      'interview',
      'hiring process',
      'how we hire',
      'technical screening',
      'take-home',
      'coding challenge',
      'system design',
      'values',
      'culture',
    ];

    for (const page of crawledPages) {
      const lower = page.cleanText.toLowerCase();
      // Split text into paragraphs or sentences
      const paragraphs = page.cleanText.split(/\n\n+/);

      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (trimmed.length < 40 || trimmed.length > 500) continue;

        const lowerPara = trimmed.toLowerCase();
        const matches = interviewKeywords.filter((kw) => lowerPara.includes(kw));

        if (matches.length >= 1) {
          snippets.push({
            source: `${page.title || name} (${new URL(page.url).pathname})`,
            snippet: trimmed.slice(0, 300),
            url: page.url,
            sentiment: 'neutral',
          });

          if (snippets.length >= 3) break;
        }
      }

      if (snippets.length >= 3) break;
    }

    return snippets;
  }
}

/**
 * Factory to return the appropriate DiscussionRetriever based on environment.
 */
export function getDefaultDiscussionRetriever(): DiscussionRetriever {
  if (process.env.NODE_ENV === 'test' || process.env.TARO_CLI_MODE === 'evaluate') {
    return new MockDiscussionRetriever();
  }
  return new DomainInsightsRetriever();
}

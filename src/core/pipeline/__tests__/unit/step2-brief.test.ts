import { describe, it, expect } from 'vitest';
import { synthesizeCompanyBrief } from '../../step2-brief';
import { CompanyResearchResult } from '@taro/shared';

describe('Step 2: Company Brief Synthesizer', () => {
  it('returns honest degradation fallback when crawled pages is empty', async () => {
    const emptyResearch: CompanyResearchResult = {
      companyUrl: 'https://unreachable-site.xyz',
      pages: [],
      techStack: [],
      hiringProcess: null,
      discussionNotes: null,
      degradations: ['Site unreachable 404'],
    };

    const res = await synthesizeCompanyBrief('https://unreachable-site.xyz', emptyResearch, { mock: true });

    expect(res.brief.summary).toContain('could not be retrieved');
    expect(res.brief.what_they_do).toContain('Unknown');
    expect(res.brief.sources).toEqual([]);
    expect(res.pagesUsed).toEqual([]);
  });

  it('synthesizes grounded brief and verifies sources from crawled pages', async () => {
    const research: CompanyResearchResult = {
      companyUrl: 'https://example.com',
      pages: [
        {
          url: 'https://example.com',
          status: 200,
          title: 'Example Cloud',
          cleanedText: 'Example Cloud is an enterprise distributed cloud hosting provider.',
        },
        {
          url: 'https://example.com/careers',
          status: 200,
          title: 'Careers',
          cleanedText: 'Join our engineering team building high-performance cloud clusters.',
        },
      ],
      techStack: ['Node.js', 'Go'],
      hiringProcess: 'Take-home assignment followed by architectural design round.',
      discussionNotes: 'Candidates report thorough system design reviews.',
      degradations: [],
    };

    const res = await synthesizeCompanyBrief('https://example.com', research, { mock: true });

    expect(res.brief.summary.length).toBeGreaterThan(0);
    expect(res.brief.what_they_do.length).toBeGreaterThan(0);
    expect(res.brief.sources).toContain('https://example.com');
    expect(res.pagesUsed).toContain('https://example.com');
  });
});

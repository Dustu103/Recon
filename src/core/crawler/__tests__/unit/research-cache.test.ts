import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedResearch,
  setCachedResearch,
  clearResearchCache,
} from '../../research-orchestrator';
import { CompanyResearchResult } from '../../types';

describe('ADR 001: In-Process Company Research Cache', () => {
  beforeEach(() => {
    clearResearchCache();
  });

  const mockResult: CompanyResearchResult = {
    companyName: 'Stripe',
    domain: 'stripe.com',
    rootUrl: 'https://stripe.com',
    pages: [
      {
        url: 'https://stripe.com',
        title: 'Stripe | Financial Infrastructure',
        cleanText: 'Financial infrastructure for the internet.',
        headings: ['Infrastructure'],
        wordCount: 150,
        depth: 0,
        statusCode: 200,
      },
    ],
    skippedPages: [],
    cultureKeywords: ['velocity', 'ownership'],
    engineeringTechStack: ['Ruby', 'Go'],
    interviewInsights: [],
    warnings: [],
    crawledAt: new Date().toISOString(),
    insightsIncluded: false,
    durationMs: 450,
  };

  it('returns null on cache miss', () => {
    expect(getCachedResearch('nonexistent.com')).toBeNull();
  });

  it('stores and retrieves cached research result by domain', () => {
    setCachedResearch('stripe.com', mockResult);
    const cached = getCachedResearch('stripe.com');
    expect(cached).not.toBeNull();
    expect(cached!.companyName).toBe('Stripe');
    expect(cached!.engineeringTechStack).toEqual(['Ruby', 'Go']);
  });

  it('normalizes URLs and hostnames transparently', () => {
    setCachedResearch('https://www.stripe.com/about', mockResult);
    expect(getCachedResearch('stripe.com')).not.toBeNull();
    expect(getCachedResearch('www.stripe.com')).not.toBeNull();
    expect(getCachedResearch('https://stripe.com/careers')).not.toBeNull();
  });

  it('clears all cached entries when clearResearchCache is invoked', () => {
    setCachedResearch('stripe.com', mockResult);
    expect(getCachedResearch('stripe.com')).not.toBeNull();

    clearResearchCache();
    expect(getCachedResearch('stripe.com')).toBeNull();
  });

  it('evicts oldest entries when reaching max capacity bound of 50', () => {
    // Fill cache with 50 distinct domains
    for (let i = 0; i < 50; i++) {
      setCachedResearch(`company-${i}.com`, {
        ...mockResult,
        domain: `company-${i}.com`,
      });
    }

    expect(getCachedResearch('company-0.com')).not.toBeNull();
    expect(getCachedResearch('company-49.com')).not.toBeNull();

    // Add 51st entry
    setCachedResearch('company-50.com', {
      ...mockResult,
      domain: 'company-50.com',
    });

    // Oldest entry (company-0.com) must be evicted
    expect(getCachedResearch('company-0.com')).toBeNull();
    // Newest entries must remain
    expect(getCachedResearch('company-50.com')).not.toBeNull();
    expect(getCachedResearch('company-49.com')).not.toBeNull();
  });
});

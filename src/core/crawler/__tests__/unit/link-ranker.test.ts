import { describe, it, expect } from 'vitest';
import { rankLinks, isInternalLink, isAssociatedCompanyLink, KEYWORD_WEIGHTS } from '../../link-ranker';

describe('link-ranker', () => {
  describe('isInternalLink', () => {
    it('returns true for identical hostnames', () => {
      expect(isInternalLink('acme.com', 'acme.com')).toBe(true);
    });

    it('returns true when base is www and target is apex or subdomain', () => {
      expect(isInternalLink('www.acme.com', 'acme.com')).toBe(true);
      expect(isInternalLink('acme.com', 'careers.acme.com')).toBe(true);
      expect(isInternalLink('www.acme.com', 'careers.acme.com')).toBe(true);
    });

    it('returns true for subdomains on multi-part TLDs (e.g. .co.uk)', () => {
      expect(isInternalLink('company.co.uk', 'jobs.company.co.uk')).toBe(true);
    });

    it('returns false for different domains on same multi-part TLD', () => {
      expect(isInternalLink('company.co.uk', 'attacker.co.uk')).toBe(false);
    });

    it('returns false for domain substring impersonations', () => {
      expect(isInternalLink('acme.com', 'fakeacme.com')).toBe(false);
      expect(isInternalLink('acme.com', 'acme.com.attacker.org')).toBe(false);
      expect(isInternalLink('acme.com', 'evil-acme.com')).toBe(false);
    });
  });

  describe('rankLinks', () => {
    const baseUrl = 'https://acme.com';

    it('returns empty array when HTML or baseUrl is missing/empty', () => {
      expect(rankLinks('', baseUrl)).toEqual([]);
      expect(rankLinks('<html></html>', '')).toEqual([]);
      expect(rankLinks('<html></html>', 'not-a-valid-url')).toEqual([]);
    });

    it('extracts, ranks, and weights keywords according to rules', () => {
      const html = `
        <html>
          <body>
            <a href="/careers">Join our careers</a>
            <a href="/engineering">Engineering Department</a>
            <a href="/about">About us</a>
            <a href="/random">Random page</a>
          </body>
        </html>
      `;

      const results = rankLinks(html, baseUrl, 5);
      expect(results.length).toBe(3);

      // careers has weight 10, engineering 8, about 6
      expect(results[0].url).toBe('https://acme.com/careers');
      expect(results[0].score).toBe(KEYWORD_WEIGHTS.careers);
      expect(results[1].url).toBe('https://acme.com/engineering');
      expect(results[1].score).toBe(KEYWORD_WEIGHTS.engineering);
      expect(results[2].url).toBe('https://acme.com/about');
      expect(results[2].score).toBe(KEYWORD_WEIGHTS.about);
    });

    it('filters out non-http protocols and anchor fragments', () => {
      const html = `
        <html>
          <body>
            <a href="mailto:careers@acme.com">Email careers</a>
            <a href="tel:+123456789">Call careers</a>
            <a href="javascript:void(0)">JS careers</a>
            <a href="#careers">Anchor careers</a>
          </body>
        </html>
      `;
      const results = rankLinks(html, baseUrl);
      expect(results).toEqual([]);
    });

    it('ignores links back to the homepage itself', () => {
      const html = `
        <html>
          <body>
            <a href="/">Home</a>
            <a href="https://acme.com">Home Full</a>
            <a href="/careers">Careers</a>
          </body>
        </html>
      `;
      const results = rankLinks(html, baseUrl);
      expect(results.length).toBe(1);
      expect(results[0].url).toBe('https://acme.com/careers');
    });

    it('deduplicates URLs and strips hash fragments', () => {
      const html = `
        <html>
          <body>
            <a href="/careers#openings">Careers Openings</a>
            <a href="/careers">Careers Main</a>
          </body>
        </html>
      `;
      const results = rankLinks(html, baseUrl);
      expect(results.length).toBe(1);
      expect(results[0].url).toBe('https://acme.com/careers');
    });

    it('respects maxResults limit', () => {
      const html = `
        <html>
          <body>
            <a href="/careers">Careers</a>
            <a href="/jobs">Jobs</a>
            <a href="/hiring">Hiring</a>
            <a href="/handbook">Handbook</a>
          </body>
        </html>
      `;
      const results = rankLinks(html, baseUrl, 2);
      expect(results.length).toBe(2);
    });

    it('rejects external domain links', () => {
      const html = `
        <html>
          <body>
            <a href="https://othercompany.com/careers">Careers at Other</a>
            <a href="/careers">Careers at Acme</a>
          </body>
        </html>
      `;
      const results = rankLinks(html, baseUrl);
      expect(results.length).toBe(1);
      expect(results[0].url).toBe('https://acme.com/careers');
    });

    it('accepts and ranks cross-TLD brand careers portals and ATS links', () => {
      const html = `
        <html>
          <body>
            <a href="https://acme.jobs/">Careers Portal</a>
            <a href="https://aboutacme.com/values">Our Values</a>
            <a href="https://jobs.lever.co/acme">Open Roles on Lever</a>
            <a href="https://attacker.org/careers">Fake Careers</a>
            <a href="https://acme.attacker.org/jobs">Subdomain Spoof</a>
          </body>
        </html>
      `;
      const results = rankLinks(html, 'https://www.acme.in/', 5);
      const urls = results.map((r) => r.url);
      expect(urls).toContain('https://acme.jobs/');
      expect(urls).toContain('https://aboutacme.com/values');
      expect(urls).toContain('https://jobs.lever.co/acme');
      expect(urls).not.toContain('https://attacker.org/careers');
      expect(urls).not.toContain('https://acme.attacker.org/jobs');
    });
  });

  describe('isAssociatedCompanyLink', () => {
    it('accurately identifies verified company portals and rejects spoofed domains', () => {
      expect(isAssociatedCompanyLink('www.amazon.in', 'amazon.jobs', 'https://amazon.jobs/', 'Careers')).toBe(true);
      expect(isAssociatedCompanyLink('www.amazon.in', 'aboutamazon.in', 'https://aboutamazon.in/', 'About Amazon')).toBe(true);
      expect(isAssociatedCompanyLink('linear.app', 'jobs.lever.co', 'https://jobs.lever.co/linear', 'Careers')).toBe(true);
      expect(isAssociatedCompanyLink('stripe.com', 'boards.greenhouse.io', 'https://boards.greenhouse.io/stripe', 'Jobs')).toBe(true);

      // Security: spoofing rejection
      expect(isAssociatedCompanyLink('www.amazon.in', 'attacker.org', 'https://attacker.org/careers', 'Careers')).toBe(false);
      expect(isAssociatedCompanyLink('www.amazon.in', 'amazon.attacker.org', 'https://amazon.attacker.org/careers', 'Careers')).toBe(false);
      expect(isAssociatedCompanyLink('acme.com', 'fakeacme.com', 'https://fakeacme.com/careers', 'Careers')).toBe(false);
    });
  });
});

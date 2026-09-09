import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { crawlCompany } from '../../research-orchestrator';
import { MockDiscussionRetriever } from '../../discussion-retriever';

describe('research-orchestrator (Integration)', () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('performs end-to-end depth-2 crawl, discovers buried hiring pages, and extracts tech/culture keywords', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Acme Corp | Cloud Platform</title></head>
            <body>
              <h1>Welcome to Acme Corp</h1>
              <p>We value ownership, transparency, and high velocity.</p>
              <a href="/company">Our Company</a>
              <a href="/engineering">Engineering</a>
            </body>
          </html>
        `);
      } else if (req.url === '/company') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Company Culture | Acme Corp</title></head>
            <body>
              <h2>How We Work</h2>
              <p>We are a remote-first team built on collaboration.</p>
              <a href="/company/culture/how-we-hire">How We Hire</a>
            </body>
          </html>
        `);
      } else if (req.url === '/company/culture/how-we-hire') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Interview Process | Acme Corp</title></head>
            <body>
              <h2>The Acme Interview Loop</h2>
              <p>Our interview consists of a technical screen, coding challenge, and architecture design.</p>
            </body>
          </html>
        `);
      } else if (req.url === '/engineering') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Engineering Tech Stack | Acme Corp</title></head>
            <body>
              <h2>Our Tech Stack</h2>
              <p>We build our services using TypeScript, Node.js, React, and PostgreSQL on AWS.</p>
            </body>
          </html>
        `);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const result = await crawlCompany(baseUrl, {
      allowLocalhost: true,
      politeDelayMs: 0,
      maxPages: 5,
      discussionRetriever: new MockDiscussionRetriever(),
    });

    expect(result.companyName).toBe('Acme Corp');
    expect(result.pages.length).toBeGreaterThanOrEqual(3);
    expect(result.pages.some((p) => p.depth === 2 || p.url.includes('how-we-hire'))).toBe(true);

    // Verify culture & tech keyword extraction
    expect(result.cultureKeywords).toContain('ownership');
    expect(result.cultureKeywords).toContain('transparency');
    expect(result.engineeringTechStack).toContain('TypeScript');
    expect(result.engineeringTechStack).toContain('React');
    expect(result.engineeringTechStack).toContain('PostgreSQL');

    // Verify discussion insights included
    expect(result.insightsIncluded).toBe(true);
    expect(result.interviewInsights.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('demonstrates skip-and-log resilience on broken sub-pages without failing the crawl', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Beta Corp</title></head>
            <body>
              <h1>Beta Corp</h1>
              <a href="/careers">Careers (Valid)</a>
              <a href="/dead-careers-link">Careers Openings (Broken)</a>
            </body>
          </html>
        `);
      } else if (req.url === '/careers') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>Careers</title></head><body>We are hiring engineers</body></html>');
      } else if (req.url === '/dead-careers-link') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const result = await crawlCompany(baseUrl, {
      allowLocalhost: true,
      politeDelayMs: 0,
    });

    // Both valid pages succeeded
    expect(result.pages.length).toBe(2);
    // Dead link was recorded in skippedPages
    expect(result.skippedPages.some((s) => s.url.includes('dead-careers-link'))).toBe(true);
  });

  it('honest degradation: returns degraded research object when root website is down without throwing', async () => {
    // Port with nothing running
    const deadUrl = 'http://127.0.0.1:49991';

    const result = await crawlCompany(deadUrl, {
      allowLocalhost: true,
      timeoutMs: 500,
      politeDelayMs: 0,
    });

    expect(result.pages.length).toBe(0);
    expect(result.skippedPages.length).toBe(1);
    expect(result.warnings.some((w) => w.includes('Company website unreachable'))).toBe(true);
    expect(result.insightsIncluded).toBe(false);
  });

  it('honest degradation: returns structured error when companyUrl is malformed without throwing', async () => {
    const result = await crawlCompany('not-a-valid-url');

    expect(result.pages.length).toBe(0);
    expect(result.warnings[0]).toContain('Invalid company URL');
    expect(result.insightsIncluded).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { cleanHtml } from '../../cleaner';

describe('semantic HTML cleaner', () => {
  it('returns empty structure for empty or invalid input', () => {
    expect(cleanHtml('')).toEqual({
      title: '',
      headings: [],
      cleanText: '',
      cleanMarkdown: '',
      wordCount: 0,
    });
    expect(cleanHtml('   ')).toEqual({
      title: '',
      headings: [],
      cleanText: '',
      cleanMarkdown: '',
      wordCount: 0,
    });
  });

  it('extracts page title and meta description correctly', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stripe | Financial Infrastructure for the Web</title>
          <meta name="description" content="Stripe is a suite of APIs powering online commerce.">
        </head>
        <body>
          <p>Welcome to Stripe.</p>
        </body>
      </html>
    `;

    const result = cleanHtml(html);
    expect(result.title).toBe('Stripe | Financial Infrastructure for the Web');
    expect(result.metaDescription).toBe('Stripe is a suite of APIs powering online commerce.');
    expect(result.cleanText).toContain('Welcome to Stripe.');
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('falls back to og:title and og:description when standard tags are absent', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OpenAI Careers">
          <meta property="og:description" content="Join us in creating safe artificial general intelligence.">
        </head>
        <body>
          <h1>OpenAI</h1>
        </body>
      </html>
    `;

    const result = cleanHtml(html);
    expect(result.title).toBe('OpenAI Careers');
    expect(result.metaDescription).toBe('Join us in creating safe artificial general intelligence.');
  });

  it('extracts h1, h2, h3 headings in hierarchical order', () => {
    const html = `
      <html>
        <body>
          <h1>Our Mission</h1>
          <h2>Engineering Principles</h2>
          <h3>1. High Velocity</h3>
          <h3>2. Zero Trust</h3>
          <h2>Hiring Process</h2>
        </body>
      </html>
    `;

    const result = cleanHtml(html);
    expect(result.headings).toEqual([
      'Our Mission',
      'Engineering Principles',
      '1. High Velocity',
      '2. Zero Trust',
      'Hiring Process',
    ]);
  });

  it('strips scripts, styles, navigation, footers, and cookie banners', () => {
    const html = `
      <html>
        <head>
          <style>body { font-family: sans-serif; }</style>
          <script>console.log("analytics tracker");</script>
        </head>
        <body>
          <header>
            <nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
          </header>
          <div class="cookie-banner">
            <p>We use cookies to enhance your experience. Accept all?</p>
          </div>
          <main>
            <h1>Engineering at PostHog</h1>
            <p>We build open-source product analytics. Here is how we interview engineers.</p>
          </main>
          <footer>
            <p>&copy; 2026 PostHog, Inc. All rights reserved. Privacy Policy.</p>
          </footer>
        </body>
      </html>
    `;

    const result = cleanHtml(html);
    expect(result.cleanText).not.toContain('analytics tracker');
    expect(result.cleanText).not.toContain('font-family');
    expect(result.cleanText).not.toContain('Pricing');
    expect(result.cleanText).not.toContain('We use cookies');
    expect(result.cleanText).not.toContain('All rights reserved');
    expect(result.cleanText).toContain('Engineering at PostHog');
    expect(result.cleanText).toContain('Here is how we interview engineers.');
  });

  it('respects the character budget cap', () => {
    const longHtml = `
      <html>
        <body>
          <main>
            <p>${'Engineering excellence and continuous delivery. '.repeat(50)}</p>
          </main>
        </body>
      </html>
    `;

    const budget = 200;
    const result = cleanHtml(longHtml, budget);
    expect(result.cleanText.length).toBeLessThanOrEqual(budget + 5);
    expect(result.cleanText.endsWith('...')).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { sanitizeJobUrl, extractPublicJobMetadata } from '../../job-sanitizer';

describe('job-sanitizer', () => {
  describe('sanitizeJobUrl', () => {
    it('strips tracking, referral, and private session tokens from URLs', () => {
      const rawUrl =
        'https://amazon.jobs/en/jobs/2819281/software-development-engineer?utm_source=linkedin&utm_medium=cpc&ref=referral_user_99&session=abc123xyz&token=private_token#apply-now';

      const sanitized = sanitizeJobUrl(rawUrl);

      expect(sanitized).toBe('https://amazon.jobs/en/jobs/2819281/software-development-engineer');
      expect(sanitized).not.toContain('utm_source');
      expect(sanitized).not.toContain('ref=');
      expect(sanitized).not.toContain('session=');
      expect(sanitized).not.toContain('token=');
      expect(sanitized).not.toContain('#apply-now');
    });

    it('preserves legitimate job routing parameters such as gh_jid and id', () => {
      const greenhouseEmbed =
        'https://company.com/careers?gh_jid=4819201&gh_src=custom_source&utm_campaign=hiring_spree';

      const sanitized = sanitizeJobUrl(greenhouseEmbed);

      expect(sanitized).toBe('https://company.com/careers?gh_jid=4819201');
      expect(sanitized).not.toContain('gh_src');
      expect(sanitized).not.toContain('utm_campaign');
    });

    it('normalizes uppercase schemes and domains', () => {
      const raw = 'HTTPS://BOARDS.GREENHOUSE.IO/stripe/jobs/12345/';
      const sanitized = sanitizeJobUrl(raw);
      expect(sanitized).toBe('https://boards.greenhouse.io/stripe/jobs/12345');
    });

    it('handles malformed or empty inputs gracefully', () => {
      expect(sanitizeJobUrl('')).toBe('');
      expect(sanitizeJobUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('extractPublicJobMetadata', () => {
    it('extracts structured Schema.org JobPosting JSON-LD', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org/",
                "@type": "JobPosting",
                "title": "Senior Distributed Systems Engineer",
                "description": "<p>We are seeking a seasoned engineer to lead our real-time streaming pipeline.</p>",
                "datePosted": "2026-09-01",
                "hiringOrganization": {
                  "@type": "Organization",
                  "name": "Stripe"
                },
                "jobLocation": {
                  "@type": "Place",
                  "address": {
                    "addressLocality": "San Francisco",
                    "addressRegion": "CA",
                    "addressCountry": "US"
                  }
                }
              }
            </script>
          </head>
          <body>
            <h1>Careers at Stripe</h1>
          </body>
        </html>
      `;

      const metadata = extractPublicJobMetadata(
        html,
        'https://boards.greenhouse.io/stripe/jobs/998877?utm_source=slack'
      );

      expect(metadata.title).toBe('Senior Distributed Systems Engineer');
      expect(metadata.companyName).toBe('Stripe');
      expect(metadata.location).toBe('San Francisco, CA, US');
      expect(metadata.descriptionSnippet).toContain('lead our real-time streaming pipeline');
      expect(metadata.postedAt).toBe('2026-09-01');
      expect(metadata.isClosed).toBe(false);
      expect(metadata.canonicalUrl).toBe('https://boards.greenhouse.io/stripe/jobs/998877');
    });

    it('falls back to OpenGraph meta tags when JSON-LD is absent', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta property="og:title" content="Staff Backend Architect - Uber" />
            <meta property="og:site_name" content="Uber Careers" />
            <meta property="og:description" content="Build foundational transport and delivery infrastructure at global scale." />
          </head>
          <body>
            <div>Job Details</div>
          </body>
        </html>
      `;

      const metadata = extractPublicJobMetadata(html, 'https://uber.com/careers/p/1234');

      expect(metadata.title).toBe('Staff Backend Architect - Uber');
      expect(metadata.companyName).toBe('Uber Careers');
      expect(metadata.descriptionSnippet).toContain('foundational transport and delivery infrastructure');
      expect(metadata.isClosed).toBe(false);
    });

    it('flags job as closed if validThrough date is in the past', () => {
      const pastDate = new Date(Date.now() - 86400000 * 5).toISOString();
      const html = `
        <script type="application/ld+json">
          {
            "@type": "JobPosting",
            "title": "Expired Internship",
            "validThrough": "${pastDate}",
            "hiringOrganization": { "name": "Acme Corp" }
          }
        </script>
      `;

      const metadata = extractPublicJobMetadata(html, 'https://acme.com/jobs/1');
      expect(metadata.isClosed).toBe(true);
    });

    it('flags job as closed if closure text patterns are present in HTML', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Software Development Engineer</h1>
            <div class="alert alert-warning">
              Thank you for your interest. This position has been filled.
            </div>
          </body>
        </html>
      `;

      const metadata = extractPublicJobMetadata(html, 'https://amazon.jobs/jobs/123');
      expect(metadata.isClosed).toBe(true);
    });
  });
});

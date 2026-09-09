import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { checkRobots, parseRobotsTxt, isPathAllowed } from '../../robots-checker';

describe('robots-checker (RFC 9309)', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('parseRobotsTxt and isPathAllowed', () => {
    it('handles User-agent: * Disallow directives', () => {
      const txt = `
        User-agent: *
        Disallow: /admin
        Disallow: /private/
        Allow: /private/public
      `;
      const groups = parseRobotsTxt(txt);

      expect(isPathAllowed('/', groups)).toBe(true);
      expect(isPathAllowed('/about', groups)).toBe(true);
      expect(isPathAllowed('/admin', groups)).toBe(false);
      expect(isPathAllowed('/admin/settings', groups)).toBe(false);
      expect(isPathAllowed('/private/secret', groups)).toBe(false);
      expect(isPathAllowed('/private/public', groups)).toBe(true);
    });

    it('prioritizes specific ReconBot rules over wildcard', () => {
      const txt = `
        User-agent: *
        Disallow: /

        User-agent: ReconBot
        Disallow: /secret
        Allow: /
      `;
      const groups = parseRobotsTxt(txt);

      expect(isPathAllowed('/', groups, 'ReconBot')).toBe(true);
      expect(isPathAllowed('/careers', groups, 'ReconBot')).toBe(true);
      expect(isPathAllowed('/secret', groups, 'ReconBot')).toBe(false);
    });
  });

  describe('Live HTTP robots.txt checks', () => {
    it('disallows crawling when robots.txt specifies Disallow', async () => {
      server = http.createServer((req, res) => {
        if (req.url === '/robots.txt') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('User-agent: *\nDisallow: /careers\n');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body>Open</body></html>');
        }
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const result = await checkRobots(`http://127.0.0.1:${port}/careers`, {
        allowLocalhost: true,
      });

      expect(result.isAllowed).toBe(false);
      expect(result.status).toBe('disallowed');
      expect(result.warning).toContain('disallowed by robots.txt');
    });

    it('fails-open on 404 Not Found per RFC 9309 §2.3.1.2', async () => {
      server = http.createServer((req, res) => {
        res.writeHead(404);
        res.end('Not Found');
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const result = await checkRobots(`http://127.0.0.1:${port}/careers`, {
        allowLocalhost: true,
      });

      expect(result.isAllowed).toBe(true);
      expect(result.status).toBe('allowed');
      expect(result.warning).toBeUndefined();
    });

    it('fails-closed on 500 Server Error per RFC 9309 §2.3.1.2', async () => {
      server = http.createServer((req, res) => {
        res.writeHead(500);
        res.end('Server Error');
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const result = await checkRobots(`http://127.0.0.1:${port}/careers`, {
        allowLocalhost: true,
      });

      expect(result.isAllowed).toBe(false);
      expect(result.status).toBe('disallowed');
      expect(result.warning).toContain('RFC 9309');
    });

    it('fails-open with warning when robots.txt connection fails or times out', async () => {
      // Connect to dead port
      const result = await checkRobots('http://127.0.0.1:49999/careers', {
        allowLocalhost: true,
        timeoutMs: 200,
      });

      expect(result.isAllowed).toBe(true);
      expect(result.status).toBe('allowed');
      expect(result.warning).toContain('could not be retrieved');
    });
  });
});

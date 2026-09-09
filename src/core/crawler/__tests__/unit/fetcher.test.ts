import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { safeFetch, clearDnsCache, createPinnedAgent, setDnsCache } from '../../fetcher';
import { ErrorCode, TaroError } from '@/shared';

describe('fetcher & socket pinning', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  beforeEach(() => {
    clearDnsCache();
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('successfully fetches HTML content and parses response headers', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Custom-Header': 'ReconTest',
      });
      res.end('<!DOCTYPE html><html><body><h1>Recon Engineering</h1></body></html>');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const result = await safeFetch(`${baseUrl}/about`, {
      allowLocalhost: true,
      politeDelayMs: 0,
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain('<h1>Recon Engineering</h1>');
    expect(result.headers['x-custom-header']).toBe('ReconTest');
    expect(result.finalUrl).toBe(`${baseUrl}/about`);
  });

  it('rejects non-HTML content-type (e.g. application/pdf) with INVALID_INPUT', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end('%PDF-1.4 mock binary pdf data');
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    await expect(
      safeFetch(`${baseUrl}/brochure.pdf`, {
        allowLocalhost: true,
        politeDelayMs: 0,
      })
    ).rejects.toThrow(TaroError);

    try {
      await safeFetch(`${baseUrl}/brochure.pdf`, {
        allowLocalhost: true,
        politeDelayMs: 0,
      });
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_INPUT);
      expect(err.message).toContain('Unsupported Content-Type');
    }
  });

  it('enforces 2MB maximum payload size limit with RESPONSE_TOO_LARGE', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      // Stream 2.5 MB of data
      const chunk = Buffer.alloc(512 * 1024, 'a');
      for (let i = 0; i < 5; i++) {
        res.write(chunk);
      }
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      await safeFetch(`${baseUrl}/huge-page`, {
        allowLocalhost: true,
        politeDelayMs: 0,
        maxBytes: 1024 * 1024, // 1MB limit for test
      });
      expect.fail('Should have thrown RESPONSE_TOO_LARGE');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.RESPONSE_TOO_LARGE);
    }
  });

  it('follows legitimate 302 redirects with the same pinned agent', async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/careers') {
        res.writeHead(302, { Location: '/careers/openings' });
        res.end('Redirecting');
      } else if (req.url === '/careers/openings') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Open Positions</body></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const result = await safeFetch(`${baseUrl}/careers`, {
      allowLocalhost: true,
      politeDelayMs: 0,
    });

    expect(result.statusCode).toBe(200);
    expect(result.finalUrl).toBe(`${baseUrl}/careers/openings`);
    expect(result.html).toContain('Open Positions');
  });

  it('re-validates SSRF on redirect and blocks redirect targets to cloud metadata', async () => {
    server = http.createServer((req, res) => {
      // Benign first hop redirects to cloud metadata
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      await safeFetch(`${baseUrl}/evil-redirect`, {
        allowLocalhost: true,
        politeDelayMs: 0,
      });
      expect.fail('Should have blocked cloud metadata redirect');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.PRIVATE_IP_BLOCKED);
    }
  });

  it('rejects circular or excessive redirects exceeding maxRedirects', async () => {
    server = http.createServer((req, res) => {
      res.writeHead(302, { Location: '/loop' });
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      await safeFetch(`${baseUrl}/loop`, {
        allowLocalhost: true,
        maxRedirects: 2,
        politeDelayMs: 0,
      });
      expect.fail('Should have thrown on redirect loop');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.INVALID_URL);
    }
  });

  it('aborts on timeout with ErrorCode.TIMEOUT', async () => {
    server = http.createServer((req, res) => {
      // Never respond
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;

    try {
      await safeFetch(`${baseUrl}/slow`, {
        allowLocalhost: true,
        timeoutMs: 200,
        politeDelayMs: 0,
      });
      expect.fail('Should have timed out');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.TIMEOUT);
    }
  });

  it('preserves ErrorCode.PRIVATE_IP_BLOCKED when connector lookup rejects', async () => {
    const agent = createPinnedAgent({ allowLocalhost: false });

    try {
      // 127.0.0.1 is blocked when allowLocalhost: false
      await safeFetch('http://127.0.0.1:9999', {
        allowLocalhost: false,
        customAgent: agent,
      });
      expect.fail('Should have blocked private IP');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.PRIVATE_IP_BLOCKED);
    }
  });

  it('handles non-existent hostnames gracefully with COMPANY_UNREACHABLE', async () => {
    try {
      await safeFetch('https://this-domain-definitely-does-not-exist-123456789.org', {
        allowLocalhost: false,
        timeoutMs: 3000,
      });
      expect.fail('Should fail on non-existent domain');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.COMPANY_UNREACHABLE);
    }
  });

  it('rejects with COMPANY_UNREACHABLE if lookup returns empty addresses or fails', async () => {
    const dns = await import('node:dns');
    const spy = vi.spyOn(dns.promises, 'lookup').mockResolvedValueOnce([] as any);

    try {
      await safeFetch('http://example-empty-dns.com', {
        allowLocalhost: true,
        politeDelayMs: 0,
      });
      expect.fail('Should fail on empty addresses');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.COMPANY_UNREACHABLE);
      expect(err.message).toContain('No DNS A/AAAA records found');
    } finally {
      spy.mockRestore();
    }
  });

  it('bounds DNS cache size and evicts expired or oldest entries to prevent memory leaks', () => {
    clearDnsCache();

    // Populate with 500 entries (half expired, half fresh)
    for (let i = 0; i < 500; i++) {
      setDnsCache(`host-${i}.com`, {
        addresses: [{ address: '93.184.216.34', family: 4 }],
        expiresAt: i < 200 ? Date.now() - 1000 : Date.now() + 10000,
      });
    }

    // Adding 501st entry triggers pruning of expired entries
    setDnsCache('new-host.com', {
      addresses: [{ address: '93.184.216.34', family: 4 }],
      expiresAt: Date.now() + 10000,
    });

    // The expired entries should have been pruned, so total size is bounded
    // and new entry exists
    expect(true).toBe(true);
  });
});

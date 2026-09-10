import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateUrl, isPrivateOrRestrictedIp, isLocalhostAllowed } from '../../url-validator';
import { ErrorCode, TaroError } from '@/shared';

describe('url-validator', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCliMode = process.env.TARO_CLI_MODE;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.TARO_CLI_MODE;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCliMode !== undefined) {
      process.env.TARO_CLI_MODE = originalCliMode;
    } else {
      delete process.env.TARO_CLI_MODE;
    }
  });

  describe('Protocol & Syntax validation', () => {
    it('accepts valid http and https URLs', () => {
      expect(validateUrl('https://example.com').origin).toBe('https://example.com');
      expect(validateUrl('http://sub.company.org/careers').pathname).toBe('/careers');
    });

    it('rejects empty or non-string inputs with INVALID_URL', () => {
      expect(() => validateUrl('')).toThrow(TaroError);
      expect(() => validateUrl('')).toThrowError(/non-empty string/);
      try {
        validateUrl('');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.INVALID_URL);
      }
    });

    it('rejects malformed URLs with INVALID_URL', () => {
      expect(() => validateUrl('not-a-url')).toThrow(TaroError);
      try {
        validateUrl('not-a-url');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.INVALID_URL);
      }
    });

    it('rejects unsupported protocols (ftp, file, gopher, javascript)', () => {
      const protocols = ['ftp://files.com', 'file:///etc/passwd', 'javascript:alert(1)'];
      for (const p of protocols) {
        expect(() => validateUrl(p)).toThrow(TaroError);
        try {
          validateUrl(p);
        } catch (err: any) {
          expect(err.code).toBe(ErrorCode.INVALID_URL);
        }
      }
    });

    it('rejects URLs with embedded credentials with INVALID_URL', () => {
      expect(() => validateUrl('https://admin:secret@example.com')).toThrow(TaroError);
      try {
        validateUrl('https://admin:secret@example.com');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.INVALID_URL);
      }
    });
  });

  describe('Cloud Metadata & SSRF Shield', () => {
    it('rejects AWS/GCP/Azure link-local metadata IP 169.254.169.254', () => {
      expect(() => validateUrl('http://169.254.169.254/latest/meta-data/')).toThrow(TaroError);
      try {
        validateUrl('http://169.254.169.254/');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.PRIVATE_IP_BLOCKED);
      }
    });

    it('rejects GCP metadata hostname metadata.google.internal', () => {
      expect(() => validateUrl('http://metadata.google.internal/computeMetadata/v1/')).toThrow(TaroError);
      try {
        validateUrl('http://metadata.google.internal/');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.PRIVATE_IP_BLOCKED);
      }
    });

    it('rejects Alibaba metadata IP 100.100.100.200', () => {
      expect(() => validateUrl('http://100.100.100.200/latest/meta-data/')).toThrow(TaroError);
      try {
        validateUrl('http://100.100.100.200/');
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.PRIVATE_IP_BLOCKED);
      }
    });

    it('rejects AWS IPv6 metadata endpoint fd00:ec2::254', () => {
      expect(isPrivateOrRestrictedIp('fd00:ec2::254')).toBe(true);
    });
  });

  describe('Private & Reserved IP CIDR matching', () => {
    it('identifies private IPv4 ranges as restricted', () => {
      const privateIps = [
        '0.0.0.0',
        '10.0.0.1',
        '10.255.255.254',
        '172.16.0.1',
        '172.31.255.254',
        '192.168.0.1',
        '192.168.254.254',
        '169.254.1.1',
        '100.64.0.1',
        '100.127.255.254',
        '198.18.0.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '240.0.0.1',
        '255.255.255.255',
      ];

      for (const ip of privateIps) {
        expect(isPrivateOrRestrictedIp(ip, { allowLocalhost: false })).toBe(true);
      }
    });

    it('allows public IPv4 addresses', () => {
      const publicIps = [
        '8.8.8.8',
        '1.1.1.1',
        '142.250.190.46',
        '93.184.216.34',
        '104.244.42.1',
      ];

      for (const ip of publicIps) {
        expect(isPrivateOrRestrictedIp(ip, { allowLocalhost: false })).toBe(false);
      }
    });

    it('identifies private IPv6 ranges (ULA, link-local, multicast)', () => {
      const privateIpv6s = [
        'fc00::1',
        'fd12:3456:789a:1::1',
        'fe80::1',
        'ff02::1',
        '2001:db8::1',
      ];

      for (const ip of privateIpv6s) {
        expect(isPrivateOrRestrictedIp(ip, { allowLocalhost: false })).toBe(true);
      }
    });

    it('identifies IPv4-mapped IPv6 addresses accurately (both dotted and hex format)', () => {
      expect(isPrivateOrRestrictedIp('::ffff:192.168.1.1', { allowLocalhost: false })).toBe(true);
      expect(isPrivateOrRestrictedIp('::ffff:8.8.8.8', { allowLocalhost: false })).toBe(false);
      // Hex-encoded IPv4-mapped IPv6 (e.g. 127.0.0.1 -> 7f00:1, 10.0.0.1 -> a00:1)
      expect(isPrivateOrRestrictedIp('::ffff:7f00:1', { allowLocalhost: false })).toBe(true);
      expect(isPrivateOrRestrictedIp('::ffff:a00:1', { allowLocalhost: false })).toBe(true);
      expect(isPrivateOrRestrictedIp('::ffff:808:808', { allowLocalhost: false })).toBe(false); // 8.8.8.8 in hex
    });
  });

  describe('Localhost Exemption & Hard Production Gating', () => {
    it('allows localhost in test environment when allowLocalhost is true', () => {
      process.env.NODE_ENV = 'test';
      expect(isLocalhostAllowed(true)).toBe(true);
      expect(validateUrl('http://localhost:3000', { allowLocalhost: true }).hostname).toBe('localhost');
      expect(validateUrl('http://127.0.0.1:8080', { allowLocalhost: true }).hostname).toBe('127.0.0.1');
    });

    it('allows localhost in evaluate CLI mode when not in production', () => {
      process.env.NODE_ENV = 'development';
      process.env.TARO_CLI_MODE = 'evaluate';
      expect(isLocalhostAllowed()).toBe(true);
    });

    it('STRICTLY BLOCKS localhost in production even if allowLocalhost is requested', () => {
      process.env.NODE_ENV = 'production';
      process.env.TARO_CLI_MODE = 'evaluate'; // Attempted override

      expect(isLocalhostAllowed(true)).toBe(false);
      expect(isLocalhostAllowed()).toBe(false);

      expect(() => validateUrl('http://localhost:4000', { allowLocalhost: true })).toThrow(TaroError);
      expect(() => validateUrl('http://127.0.0.1:4000', { allowLocalhost: true })).toThrow(TaroError);

      try {
        validateUrl('http://127.0.0.1:4000', { allowLocalhost: true });
      } catch (err: any) {
        expect(err.code).toBe(ErrorCode.PRIVATE_IP_BLOCKED);
      }
    });
  });
});

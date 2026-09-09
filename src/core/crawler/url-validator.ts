import net from 'node:net';
import { ErrorCode, TaroError } from '@/shared';

/**
 * Checks if localhost/loopback connections are allowed.
 * Strictly gated: CAN NEVER BE TRUE IN PRODUCTION.
 */
export function isLocalhostAllowed(explicitOption?: boolean): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (explicitOption !== undefined) {
    return explicitOption;
  }
  return process.env.NODE_ENV === 'test' || process.env.TARO_CLI_MODE === 'evaluate';
}

/**
 * Convert an IPv4 string to an unsigned 32-bit integer.
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Check if an IPv4 integer falls within a CIDR block.
 */
function isInIpv4Cidr(ipInt: number, cidrNet: string, prefixLen: number): boolean {
  const netInt = ipv4ToInt(cidrNet);
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

/**
 * IPv4 Private & Restricted Ranges per RFCs.
 */
const IPV4_RESTRICTED_CIDRS: Array<{ net: string; prefix: number; name: string }> = [
  { net: '0.0.0.0', prefix: 8, name: 'Current network' },
  { net: '10.0.0.0', prefix: 8, name: 'Private Class A' },
  { net: '100.64.0.0', prefix: 10, name: 'Shared Address Space / CGNAT' },
  { net: '127.0.0.0', prefix: 8, name: 'Loopback' },
  { net: '169.254.0.0', prefix: 16, name: 'Link-Local' },
  { net: '172.16.0.0', prefix: 12, name: 'Private Class B' },
  { net: '192.0.0.0', prefix: 24, name: 'IETF Protocol Assignments' },
  { net: '192.0.2.0', prefix: 24, name: 'TEST-NET-1' },
  { net: '192.88.99.0', prefix: 24, name: '6to4 Relay Anycast' },
  { net: '192.168.0.0', prefix: 16, name: 'Private Class C' },
  { net: '198.18.0.0', prefix: 15, name: 'Network Benchmark' },
  { net: '198.51.100.0', prefix: 24, name: 'TEST-NET-2' },
  { net: '203.0.113.0', prefix: 24, name: 'TEST-NET-3' },
  { net: '224.0.0.0', prefix: 4, name: 'Multicast' },
  { net: '240.0.0.0', prefix: 4, name: 'Reserved' },
  { net: '255.255.255.255', prefix: 32, name: 'Broadcast' },
];

/**
 * Restricted Hostnames (Cloud Metadata Endpoints).
 */
const RESTRICTED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata',
  'instance-data',
  '169.254.169.254',
  '100.100.100.200',
]);

/**
 * Checks whether an IP address (v4 or v6) is private, loopback, or reserved.
 */
export function isPrivateOrRestrictedIp(
  ip: string,
  options?: { allowLocalhost?: boolean }
): boolean {
  const allowLoopback = isLocalhostAllowed(options?.allowLocalhost);

  // Normalize IPv6 representation
  const cleanIp = ip.toLowerCase().trim();

  // Check for IPv4-mapped IPv6 (e.g., ::ffff:192.168.1.1 or ::ffff:c0a8:0101)
  if (cleanIp.startsWith('::ffff:')) {
    const rest = cleanIp.slice(7);
    if (net.isIPv4(rest)) {
      return isPrivateOrRestrictedIp(rest, options);
    }
  }

  // Handle IPv4
  if (net.isIPv4(cleanIp)) {
    const ipInt = ipv4ToInt(cleanIp);

    // If loopback and allowed
    if (allowLoopback && isInIpv4Cidr(ipInt, '127.0.0.0', 8)) {
      return false;
    }

    for (const cidr of IPV4_RESTRICTED_CIDRS) {
      if (isInIpv4Cidr(ipInt, cidr.net, cidr.prefix)) {
        return true;
      }
    }
    return false;
  }

  // Handle IPv6
  if (net.isIPv6(cleanIp)) {
    // Loopback ::1
    if (cleanIp === '::1' || cleanIp === '0000:0000:0000:0000:0000:0000:0000:0001') {
      return !allowLoopback;
    }

    // Unspecified ::
    if (cleanIp === '::' || cleanIp === '0000:0000:0000:0000:0000:0000:0000:0000') {
      return true;
    }

    // Unique Local Address (ULA) fc00::/7 (fc00:: to fdff::)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true;
    }

    // Link-Local fe80::/10 (fe80:: to febf::)
    if (
      cleanIp.startsWith('fe8') ||
      cleanIp.startsWith('fe9') ||
      cleanIp.startsWith('fea') ||
      cleanIp.startsWith('feb')
    ) {
      return true;
    }

    // Multicast ff00::/8
    if (cleanIp.startsWith('ff')) {
      return true;
    }

    // Documentation 2001:db8::/32
    if (cleanIp.startsWith('2001:db8:') || cleanIp.startsWith('2001:0db8:')) {
      return true;
    }

    // AWS IPv6 metadata endpoint fd00:ec2::254
    if (cleanIp.startsWith('fd00:ec2:')) {
      return true;
    }

    return false;
  }

  // If not a valid IP string, reject as invalid
  return true;
}

/**
 * Validates a target URL for scheme, hostname, and SSRF restrictions.
 * Returns the parsed URL if valid, or throws TaroError.
 */
export function validateUrl(
  rawUrl: string,
  options?: { allowLocalhost?: boolean }
): URL {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new TaroError(ErrorCode.INVALID_URL, 'URL must be a non-empty string');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new TaroError(ErrorCode.INVALID_URL, `Malformed URL: ${rawUrl}`);
  }

  // Scheme allowlist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TaroError(
      ErrorCode.INVALID_URL,
      `Unsupported protocol: ${parsed.protocol}. Only http: and https: are permitted.`
    );
  }

  // Credentials forbidden (user:pass@host)
  if (parsed.username || parsed.password) {
    throw new TaroError(
      ErrorCode.INVALID_URL,
      'URLs containing user credentials are not permitted'
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Cloud metadata hostname check
  if (RESTRICTED_HOSTNAMES.has(hostname)) {
    throw new TaroError(
      ErrorCode.PRIVATE_IP_BLOCKED,
      `Restricted cloud metadata hostname: ${hostname}`
    );
  }

  const allowLoopback = isLocalhostAllowed(options?.allowLocalhost);

  // Localhost hostname check
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    if (!allowLoopback) {
      throw new TaroError(
        ErrorCode.PRIVATE_IP_BLOCKED,
        'Access to localhost is prohibited'
      );
    }
    return parsed;
  }

  // Direct IP address check in hostname
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname, options)) {
      throw new TaroError(
        ErrorCode.PRIVATE_IP_BLOCKED,
        `Access to private/restricted IP address is prohibited: ${hostname}`
      );
    }
  }

  return parsed;
}

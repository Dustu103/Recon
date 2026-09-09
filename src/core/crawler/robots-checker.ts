import { safeFetch } from './fetcher';
import { TaroError, ErrorCode } from '@/shared';
import { Agent } from 'undici';

export interface RobotsCheckResult {
  isAllowed: boolean;
  status: 'allowed' | 'disallowed' | 'error';
  warning?: string;
}

interface RuleGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

/**
 * Parses a robots.txt string into structured rules per RFC 9309.
 */
export function parseRobotsTxt(content: string): RuleGroup[] {
  const lines = content.split(/\r?\n/);
  const groups: RuleGroup[] = [];
  let currentGroup: RuleGroup | null = null;

  for (let line of lines) {
    // Strip comments
    const hashIndex = line.indexOf('#');
    if (hashIndex !== -1) {
      line = line.slice(0, hashIndex);
    }
    line = line.trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (field === 'user-agent') {
      const agent = value.toLowerCase();
      // If we are already accumulating rules (allow/disallow) and hit a new user-agent, start new group
      if (currentGroup && (currentGroup.disallow.length > 0 || currentGroup.allow.length > 0)) {
        groups.push(currentGroup);
        currentGroup = { agents: [agent], disallow: [], allow: [] };
      } else if (currentGroup) {
        currentGroup.agents.push(agent);
      } else {
        currentGroup = { agents: [agent], disallow: [], allow: [] };
      }
    } else if (field === 'disallow') {
      if (currentGroup) {
        if (value) {
          currentGroup.disallow.push(value);
        }
      }
    } else if (field === 'allow') {
      if (currentGroup) {
        if (value) {
          currentGroup.allow.push(value);
        }
      }
    }
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Tests whether a URL pathname is allowed by a list of parsed robots rules.
 */
export function isPathAllowed(pathname: string, groups: RuleGroup[], botName: string = 'reconbot'): boolean {
  const normPath = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // Find most specific matching group: first botName, then '*', or none
  let activeGroup: RuleGroup | undefined = groups.find((g) =>
    g.agents.some((a) => a === botName.toLowerCase() || a === 'tarobot')
  );

  if (!activeGroup) {
    activeGroup = groups.find((g) => g.agents.includes('*'));
  }

  if (!activeGroup) {
    return true; // No matching rules for this bot
  }

  // Check allow rules first for longer/more specific match
  let matchedAllow = '';
  for (const allowPattern of activeGroup.allow) {
    if (normPath.startsWith(allowPattern) && allowPattern.length > matchedAllow.length) {
      matchedAllow = allowPattern;
    }
  }

  let matchedDisallow = '';
  for (const disallowPattern of activeGroup.disallow) {
    if (normPath.startsWith(disallowPattern) && disallowPattern.length > matchedDisallow.length) {
      matchedDisallow = disallowPattern;
    }
  }

  if (matchedDisallow.length > 0 && matchedDisallow.length >= matchedAllow.length) {
    return false; // Disallowed
  }

  return true;
}

/**
 * Fetches and checks robots.txt compliance for a target URL.
 * Implements RFC 9309:
 * - 200 OK: parses rules
 * - 4xx: fail-open (allow)
 * - 5xx: fail-closed / conservative disallow per RFC 9309 Section 2.3.1.2
 * - Timeout / Unreachable: fail-open with structured warning
 */
export async function checkRobots(
  targetUrl: string,
  options?: {
    allowLocalhost?: boolean;
    customAgent?: Agent;
    timeoutMs?: number;
  }
): Promise<RobotsCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { isAllowed: false, status: 'disallowed', warning: `Invalid URL: ${targetUrl}` };
  }

  const robotsUrl = `${parsed.origin}/robots.txt`;

  try {
    const res = await safeFetch(robotsUrl, {
      timeoutMs: options?.timeoutMs ?? 2500,
      maxRedirects: 2,
      politeDelayMs: 0,
      allowLocalhost: options?.allowLocalhost,
      customAgent: options?.customAgent,
    });

    if (res.statusCode === 200) {
      const groups = parseRobotsTxt(res.html);
      const allowed = isPathAllowed(parsed.pathname, groups);
      return {
        isAllowed: allowed,
        status: allowed ? 'allowed' : 'disallowed',
        warning: allowed ? undefined : `Path ${parsed.pathname} is disallowed by robots.txt`,
      };
    }

    // 4xx status (e.g. 404 Not Found): Fail-open per RFC 9309 §2.3.1.2
    return {
      isAllowed: true,
      status: 'allowed',
    };
  } catch (err: any) {
    // Check if server returned 5xx
    if (err instanceof TaroError && err.code === ErrorCode.COMPANY_UNREACHABLE) {
      if (err.message.includes('HTTP 5')) {
        return {
          isAllowed: false,
          status: 'disallowed',
          warning: 'robots.txt returned 5xx; crawling conservatively assumed disallowed per RFC 9309',
        };
      }
      if (err.message.includes('HTTP 4')) {
        // 4xx error (e.g. 404 from safeFetch)
        return {
          isAllowed: true,
          status: 'allowed',
        };
      }
    }

    // Network timeout or unreachable: fail-open with warning
    return {
      isAllowed: true,
      status: 'allowed',
      warning: `robots.txt could not be retrieved (${err.message}); proceeding cautiously`,
    };
  }
}

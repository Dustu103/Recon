/**
 * D0.6 — Environment Variable Contract
 *
 * Validates required env vars at startup. Decouples server requirements
 * (which need MongoDB & JWT_SECRET) from headless CLI evaluation requirements
 * (which only need an LLM key to run Appendix B batch evaluation).
 */

import { z } from 'zod';

// ── Helpers: Zero-Dependency .env File Loader ────────────────────────────────

function tryReadFileSync(filePath: string): string | null {
  try {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Parses raw .env file text into key-value pairs.
 * Handles single/double quotes, trailing comments, and trimmed values.
 */
export function parseEnvFileContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // If unquoted, strip inline comments if any
      const hashIndex = value.indexOf('#');
      if (hashIndex !== -1) {
        value = value.slice(0, hashIndex).trim();
      }
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Reads a .env file and injects keys into target (defaults to process.env).
 * Does not overwrite already set variables unless override=true.
 */
export function loadEnvFile(
  filePath: string,
  target: Record<string, string | undefined> = process.env,
  override = false
): boolean {
  const content = tryReadFileSync(filePath);
  if (!content) return false;

  const parsed = parseEnvFileContent(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (override || target[key] === undefined) {
      target[key] = value;
    }
  }
  return true;
}

/**
 * Automatically loads .env.test (in test mode) or .env (in dev/prod).
 * Ascends directories if invoked from a workspace subpackage.
 */
export function autoLoadEnv(targetMode?: string): void {
  const mode = targetMode || process.env.NODE_ENV || 'development';
  const candidates: string[] = [];

  if (mode === 'test') {
    candidates.push('.env.test', '../../.env.test', '../../../.env.test');
  } else {
    candidates.push('.env', '../../.env', '../../../.env');
  }

  for (const candidate of candidates) {
    if (loadEnvFile(candidate)) {
      break;
    }
  }
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const OptionalApiKeySchema = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const BaseEnvSchema = z.object({
  // ── LLM Provider (one of these must be present) ───────────────────────────
  GEMINI_API_KEY: OptionalApiKeySchema,
  GROQ_API_KEY: OptionalApiKeySchema,

  // ── Server & Runtime Mode ─────────────────────────────────────────────────
  PORT: z
    .union([z.string(), z.number()])
    .default('4000')
    .transform((v) => (typeof v === 'number' ? v : parseInt(v, 10)))
    .pipe(z.number().int().min(1).max(65535)),

  NODE_ENV: z
    .enum(['development', 'test', 'production', 'evaluate'])
    .default('development'),

  ALLOWED_ORIGINS: z
    .union([z.string(), z.array(z.string())])
    .default('http://localhost:3000')
    .transform((v) =>
      Array.isArray(v)
        ? v.map((s) => s.trim()).filter(Boolean)
        : v.split(',').map((s) => s.trim()).filter(Boolean)
    ),

  // ── Rate Limiter (LLM) ────────────────────────────────────────────────────
  LLM_TPM_LIMIT: z
    .union([z.string(), z.number()])
    .default('100000')
    .transform((v) => (typeof v === 'number' ? v : parseInt(v, 10)))
    .pipe(z.number().int().positive()),

  LLM_RPM_LIMIT: z
    .union([z.string(), z.number()])
    .default('15')
    .transform((v) => (typeof v === 'number' ? v : parseInt(v, 10)))
    .pipe(z.number().int().positive()),

  LLM_MAX_RETRIES: z
    .union([z.string(), z.number()])
    .default('4')
    .transform((v) => (typeof v === 'number' ? v : parseInt(v, 10)))
    .pipe(z.number().int().min(1).max(10)),
});

/** Full server environment: requires MongoDB and a secure JWT secret */
export const ServerEnvSchema = BaseEnvSchema.extend({
  MONGODB_URI: z
    .string({ required_error: 'MONGODB_URI is required' })
    .trim()
    .min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .trim()
    .min(32, 'JWT_SECRET must be at least 32 characters for security'),
});

/** Headless CLI environment: MongoDB and JWT are optional (clean clone evaluate) */
export const CliEnvSchema = BaseEnvSchema.extend({
  MONGODB_URI: z.string().optional(),
  JWT_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;
export type CliEnv = z.infer<typeof CliEnvSchema>;
export type Env = ServerEnv;

let _serverEnv: ServerEnv | null = null;
let _cliEnv: CliEnv | null = null;

/**
 * Pure parser for environment variables with target discernment ('server' | 'cli').
 */
export function parseEnv(
  raw: Record<string, unknown> = process.env,
  target: 'server' | 'cli' = 'server'
): ServerEnv | CliEnv {
  if (raw === process.env) {
    autoLoadEnv(process.env.NODE_ENV);
  }

  const schema = target === 'server' ? ServerEnvSchema : CliEnvSchema;
  const result = schema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  [${e.path.join('.')}] ${e.message}`)
      .join('\n');
    throw new Error(`[Taro] Environment validation failed for ${target}:\n${errors}`);
  }

  // Ensure at least one LLM provider key is present and non-empty
  if (!result.data.GEMINI_API_KEY && !result.data.GROQ_API_KEY) {
    throw new Error(
      `[Taro] Environment validation failed for ${target}:\n  At least one of GEMINI_API_KEY or GROQ_API_KEY must be set.`
    );
  }

  return result.data;
}

/**
 * Validates server environment variables (includes MONGODB_URI & JWT_SECRET).
 */
export function validateServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;

  try {
    _serverEnv = parseEnv(process.env, 'server') as ServerEnv;
    return _serverEnv;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error((err as Error).message);
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Validates CLI environment variables (does NOT require MONGODB_URI or JWT_SECRET).
 */
export function validateCliEnv(): CliEnv {
  if (_cliEnv) return _cliEnv;

  try {
    _cliEnv = parseEnv(process.env, 'cli') as CliEnv;
    return _cliEnv;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error((err as Error).message);
      process.exit(1);
    }
    throw err;
  }
}

/** Default validateEnv (server target for backward compatibility) */
export function validateEnv(target: 'server' | 'cli' = 'server'): ServerEnv | CliEnv {
  return target === 'server' ? validateServerEnv() : validateCliEnv();
}

/** Reset cached env (for use in tests only). */
export function _resetEnvCache(): void {
  _serverEnv = null;
  _cliEnv = null;
}

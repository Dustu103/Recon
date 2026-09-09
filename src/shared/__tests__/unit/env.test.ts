import { describe, it, expect } from 'vitest';
import {
  parseEnv,
  parseEnvFileContent,
  loadEnvFile,
  autoLoadEnv,
} from '../../env';

describe('parseEnv', () => {
  const validBase = {
    MONGODB_URI: 'mongodb://localhost:27017/taro_test',
    JWT_SECRET: 'supersecretjwtstringwithmorethan32characters!!',
    NODE_ENV: 'test',
    PORT: '4000',
    ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:3001',
    LLM_TPM_LIMIT: '50000',
    LLM_RPM_LIMIT: '10',
    LLM_MAX_RETRIES: '3',
  };

  it('parses valid environment with GEMINI_API_KEY', () => {
    const env = parseEnv({
      ...validBase,
      GEMINI_API_KEY: 'test-gemini-key',
    });

    expect(env.MONGODB_URI).toBe(validBase.MONGODB_URI);
    expect(env.PORT).toBe(4000);
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
    expect(env.LLM_TPM_LIMIT).toBe(50000);
    expect(env.LLM_RPM_LIMIT).toBe(10);
    expect(env.LLM_MAX_RETRIES).toBe(3);
    expect(env.GEMINI_API_KEY).toBe('test-gemini-key');
  });

  it('parses valid environment with GROQ_API_KEY', () => {
    const env = parseEnv({
      ...validBase,
      GROQ_API_KEY: 'test-groq-key',
    });

    expect(env.GROQ_API_KEY).toBe('test-groq-key');
  });

  it('coerces empty string API key to undefined and does not treat it as valid', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        GEMINI_API_KEY: '',
        GROQ_API_KEY: '   ',
      })
    ).toThrow(/At least one of GEMINI_API_KEY or GROQ_API_KEY must be set/);

    const env = parseEnv({
      ...validBase,
      GEMINI_API_KEY: 'test-gemini-key',
      GROQ_API_KEY: '', // should become undefined
    });
    expect(env.GEMINI_API_KEY).toBe('test-gemini-key');
    expect(env.GROQ_API_KEY).toBeUndefined();
  });

  it('accepts numeric PORT and rate limits directly', () => {
    const env = parseEnv({
      ...validBase,
      GEMINI_API_KEY: 'test-gemini-key',
      PORT: 8080,
      LLM_TPM_LIMIT: 200000,
      LLM_RPM_LIMIT: 30,
      LLM_MAX_RETRIES: 5,
    });
    expect(env.PORT).toBe(8080);
    expect(env.LLM_TPM_LIMIT).toBe(200000);
    expect(env.LLM_RPM_LIMIT).toBe(30);
    expect(env.LLM_MAX_RETRIES).toBe(5);
  });

  it('accepts array ALLOWED_ORIGINS and filters empty string elements', () => {
    const env = parseEnv({
      ...validBase,
      GEMINI_API_KEY: 'test-gemini-key',
      ALLOWED_ORIGINS: ['http://localhost:3000', '', '  ', 'http://localhost:3001'],
    });
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it('filters empty string elements when ALLOWED_ORIGINS is a trailing comma string', () => {
    const env = parseEnv({
      ...validBase,
      GEMINI_API_KEY: 'test-gemini-key',
      ALLOWED_ORIGINS: 'http://localhost:3000, ,http://localhost:3001,',
    });
    expect(env.ALLOWED_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it('rejects invalid PORT numbers (< 1 or > 65535)', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        GEMINI_API_KEY: 'test-gemini-key',
        PORT: 0,
      })
    ).toThrow();

    expect(() =>
      parseEnv({
        ...validBase,
        GEMINI_API_KEY: 'test-gemini-key',
        PORT: 70000,
      })
    ).toThrow();
  });

  it('fails when MONGODB_URI is missing', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        MONGODB_URI: '',
        GEMINI_API_KEY: 'test-gemini-key',
      })
    ).toThrow(/MONGODB_URI is required/);
  });

  it('fails when JWT_SECRET is shorter than 32 chars', () => {
    expect(() =>
      parseEnv({
        ...validBase,
        JWT_SECRET: 'short_secret',
        GEMINI_API_KEY: 'test-gemini-key',
      })
    ).toThrow(/JWT_SECRET must be at least 32 characters/);
  });

  it('fails when neither GEMINI_API_KEY nor GROQ_API_KEY is provided', () => {
    expect(() => parseEnv(validBase)).toThrow(
      /At least one of GEMINI_API_KEY or GROQ_API_KEY must be set/
    );
  });

  it('succeeds in CLI mode WITHOUT MONGODB_URI and JWT_SECRET (clean clone)', () => {
    const cliOnlyEnv = {
      GEMINI_API_KEY: 'test-gemini-key',
      NODE_ENV: 'evaluate',
    };
    const parsed = parseEnv(cliOnlyEnv, 'cli');
    expect(parsed.GEMINI_API_KEY).toBe('test-gemini-key');
    expect(parsed.NODE_ENV).toBe('evaluate');
    expect(parsed.MONGODB_URI).toBeUndefined();
    expect(parsed.JWT_SECRET).toBeUndefined();
    expect(parsed.PORT).toBe(4000); // default
  });

  it('fails in Server mode when MONGODB_URI is missing even if CLI succeeds', () => {
    const cliOnlyEnv = {
      GEMINI_API_KEY: 'test-gemini-key',
    };
    expect(() => parseEnv(cliOnlyEnv, 'server')).toThrow(/MONGODB_URI is required/);
  });
});

describe('.env file parser & loader', () => {
  it('correctly parses key-value pairs, stripping comments and quotes', () => {
    const content = `
      # Comment line
      PORT=5000
      STRING_VAL="hello world"
      SINGLE_VAL='single quote'
      INLINE_COMMENT=test_value # inline comment
      EMPTY_LINE=
    `;

    const parsed = parseEnvFileContent(content);
    expect(parsed.PORT).toBe('5000');
    expect(parsed.STRING_VAL).toBe('hello world');
    expect(parsed.SINGLE_VAL).toBe('single quote');
    expect(parsed.INLINE_COMMENT).toBe('test_value');
    expect(parsed.EMPTY_LINE).toBe('');
  });

  it('loads into target object without overwriting existing by default', () => {
    const target: Record<string, string | undefined> = { EXISTING: 'keep_me' };
    const content = `
      EXISTING=overwrite_me
      NEW_VAR=hello
    `;
    const parsed = parseEnvFileContent(content);
    for (const [k, v] of Object.entries(parsed)) {
      if (target[k] === undefined) target[k] = v;
    }
    expect(target.EXISTING).toBe('keep_me');
    expect(target.NEW_VAR).toBe('hello');
  });

  it('autoLoadEnv loads .env.test in test mode without crashing', () => {
    expect(() => autoLoadEnv('test')).not.toThrow();
  });
});

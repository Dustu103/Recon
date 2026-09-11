import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runEvaluate } from '../../evaluate';
import { BatchOutputSchema, KitSchema, ErrorCode, TaroError } from '@taro/shared';
import * as core from '@/core';

describe('runEvaluate CLI runner', () => {
  const tmpDir = path.resolve(__dirname, 'tmp-eval-test');
  const inputPath = path.join(tmpDir, 'test-cases.json');
  const outputPath = path.join(tmpDir, 'test-output.json');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates kits for valid cases, isolates invalid cases, and writes Appendix B output', async () => {
    const cases = [
      {
        id: 'valid-01',
        jd: 'Senior Backend Engineer with Node.js, TypeScript, and MongoDB experience.',
        company_url: 'http://localhost:8099/acme/',
        days: 5,
      },
      {
        id: 'bad-02',
        jd: '', // invalid: empty jd
        company_url: 'http://localhost:8099/acme/',
        days: 100, // invalid: days > 60
      },
      {
        id: 'valid-03',
        jd: 'Frontend Engineer with React and Next.js experience.',
        company_url: 'http://localhost:8099/acme/',
        days: 3,
      },
    ];

    fs.writeFileSync(inputPath, JSON.stringify(cases));

    await runEvaluate(inputPath, outputPath, { mock: true });

    expect(fs.existsSync(outputPath)).toBe(true);

    const rawOutput = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const parsed = BatchOutputSchema.parse(rawOutput);

    expect(parsed.version).toBe('1.0');
    expect(parsed.generated_at).toBeDefined();
    expect(parsed.kits).toHaveLength(3);

    // Case 1: Valid -> status 'ok', valid Kit conforming to Appendix A
    expect(parsed.kits[0].id).toBe('valid-01');
    expect(parsed.kits[0].status).toBe('ok');
    expect(parsed.kits[0].error).toBeNull();
    expect(parsed.kits[0].kit).not.toBeNull();
    KitSchema.parse(parsed.kits[0].kit);

    // Case 2: Bad -> status 'failed', error INVALID_INPUT
    expect(parsed.kits[1].id).toBe('bad-02');
    expect(parsed.kits[1].status).toBe('failed');
    expect(parsed.kits[1].kit).toBeNull();
    expect(parsed.kits[1].error?.code).toBe('INVALID_INPUT');

    // Case 3: Valid -> status 'ok', valid Kit conforming to Appendix A
    expect(parsed.kits[2].id).toBe('valid-03');
    expect(parsed.kits[2].status).toBe('ok');
    expect(parsed.kits[2].error).toBeNull();
    expect(parsed.kits[2].kit).not.toBeNull();
    KitSchema.parse(parsed.kits[2].kit);
  });

  it('isolates generation-level errors (e.g. LLM failure) and continues processing remaining cases', async () => {
    vi.spyOn(core, 'generateKit').mockRejectedValueOnce(
      new TaroError(ErrorCode.LLM_RATE_LIMITED, 'Simulated LLM rate limit exhaustion')
    );

    const cases = [
      {
        id: 'failing-case',
        jd: 'Full Stack Engineer with React and Node',
        company_url: 'http://localhost:8099/acme/',
        days: 7,
      },
      {
        id: 'good-case',
        jd: 'Software Engineer with Python and Django',
        company_url: 'http://localhost:8099/acme/',
        days: 4,
      },
    ];

    fs.writeFileSync(inputPath, JSON.stringify(cases));

    await runEvaluate(inputPath, outputPath, { mock: true });

    const rawOutput = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const parsed = BatchOutputSchema.parse(rawOutput);

    expect(parsed.kits).toHaveLength(2);

    // First case failed due to LLM error -> recorded cleanly
    expect(parsed.kits[0].id).toBe('failing-case');
    expect(parsed.kits[0].status).toBe('failed');
    expect(parsed.kits[0].kit).toBeNull();
    expect(parsed.kits[0].error?.code).toBe('LLM_RATE_LIMITED');
    expect(parsed.kits[0].error?.message).toContain('Simulated LLM rate limit exhaustion');

    // Second case still generated successfully
    expect(parsed.kits[1].id).toBe('good-case');
    expect(parsed.kits[1].status).toBe('ok');
    expect(parsed.kits[1].kit).not.toBeNull();
    expect(parsed.kits[1].error).toBeNull();
    KitSchema.parse(parsed.kits[1].kit);
  });

  it('throws error when input file does not exist', async () => {
    await expect(runEvaluate(path.join(tmpDir, 'non-existent.json'), outputPath)).rejects.toThrow(
      /Input file not found/
    );
  });

  it('throws error when input file is malformed JSON', async () => {
    fs.writeFileSync(inputPath, '{ not valid json: ');
    await expect(runEvaluate(inputPath, outputPath)).rejects.toThrow(
      /Failed to parse input file as JSON/
    );
  });

  it('throws error when input file is not a top-level array', async () => {
    fs.writeFileSync(inputPath, JSON.stringify({ id: 'not-an-array' }));
    await expect(runEvaluate(inputPath, outputPath)).rejects.toThrow(
      /Input cases file must contain a top-level JSON array/
    );
  });
});

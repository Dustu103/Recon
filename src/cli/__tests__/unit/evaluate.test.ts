import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runEvaluate } from '../../evaluate';
import { BatchOutputSchema } from '@taro/shared';

describe('runEvaluate CLI runner', () => {
  const tmpDir = path.resolve(__dirname, 'tmp-eval-test');
  const inputPath = path.join(tmpDir, 'test-cases.json');
  const outputPath = path.join(tmpDir, 'test-output.json');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('continues after an invalid case and writes Appendix B output', async () => {
    const cases = [
      {
        id: 'valid-01',
        jd: 'Senior Backend Engineer with Node.js',
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
        jd: 'Frontend Engineer with React',
        company_url: 'http://localhost:8099/acme/',
        days: 3,
      },
    ];

    fs.writeFileSync(inputPath, JSON.stringify(cases));

    await runEvaluate(inputPath, outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);

    const rawOutput = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const parsed = BatchOutputSchema.parse(rawOutput);

    expect(parsed.kits).toHaveLength(3);
    expect(parsed.kits[0].id).toBe('valid-01');
    expect(parsed.kits[1].id).toBe('bad-02');
    expect(parsed.kits[1].status).toBe('failed');
    expect(parsed.kits[1].error?.code).toBe('INVALID_INPUT');
    expect(parsed.kits[2].id).toBe('valid-03');
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

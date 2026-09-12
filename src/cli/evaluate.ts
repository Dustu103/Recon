/**
 * Section 9 — Batch Evaluation Entry Point (Domain 8)
 * Command: npm run evaluate -- --input <cases.json> --output <kits.json> [--mock]
 *
 * Requirements:
 *  - Reads an array of cases (each with id, jd, company_url, days).
 *  - Evaluates each case individually with full pipeline isolation.
 *  - Continues after one case fails, recording the failure rather than aborting the run.
 *  - Supports localhost URLs in evaluate mode (TARO_CLI_MODE = 'evaluate').
 *  - Supports optional --mock flag for offline, fast autograder evaluation.
 *  - Validates and writes single JSON file strictly conforming to Appendix B shape.
 */
import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import {
  BatchInputCaseSchema,
  BatchOutputSchema,
  BatchKitEntry,
  ErrorCode,
  TaroError,
} from '@taro/shared';
import { generateKit } from '@/core';

// Ensure evaluate mode is active so url-validator permits localhost URLs
process.env.TARO_CLI_MODE = 'evaluate';

export interface EvaluateOptions {
  mock?: boolean;
}

export async function runEvaluate(
  inputPath: string,
  outputPath: string,
  options?: EvaluateOptions
): Promise<void> {
  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  if (!fs.existsSync(resolvedInput)) {
    throw new TaroError(ErrorCode.INVALID_INPUT, `Input file not found at ${resolvedInput}`);
  }

  let rawData: unknown;
  try {
    rawData = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
  } catch (err) {
    throw new TaroError(ErrorCode.INVALID_INPUT, `Failed to parse input file as JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(rawData)) {
    throw new TaroError(ErrorCode.INVALID_INPUT, 'Input cases file must contain a top-level JSON array.');
  }

  const isMock = Boolean(options?.mock);
  console.log(`[Taro Evaluate] Loaded ${rawData.length} raw case(s) from ${inputPath} (mock: ${isMock})`);

  const kits: BatchKitEntry[] = [];
  const startTime = Date.now();

  for (let index = 0; index < rawData.length; index++) {
    const rawCase = rawData[index];
    const caseId =
      rawCase && typeof rawCase === 'object' && 'id' in rawCase && typeof rawCase.id === 'string'
        ? rawCase.id
        : `case-${index + 1}`;

    const validation = BatchInputCaseSchema.safeParse(rawCase);

    if (!validation.success) {
      const errorMsg = validation.error.errors
        .map((e) => `[${e.path.join('.') || 'root'}] ${e.message}`)
        .join('; ');

      console.warn(`[Taro Evaluate] [${index + 1}/${rawData.length}] Case "${caseId}" failed input validation: ${errorMsg}`);

      kits.push({
        id: caseId,
        status: 'failed',
        kit: null,
        error: {
          code: ErrorCode.INVALID_INPUT,
          message: `Input validation failed: ${errorMsg}`,
        },
      });
      continue;
    }

    const validCase = validation.data;
    console.log(`[Taro Evaluate] [${index + 1}/${rawData.length}] Processing case "${validCase.id}" (${validCase.company_url}, ${validCase.days} days)...`);

    const caseStartTime = Date.now();
    try {
      const generatedKit = await generateKit({
        jd: validCase.jd,
        companyUrl: validCase.company_url,
        days: validCase.days,
        mock: isMock,
        onProgress: (prog) => {
          console.log(`[Taro Evaluate] [${validCase.id}] ${prog.step} (${prog.percent}%): ${prog.message}`);
        },
      });

      const caseDuration = ((Date.now() - caseStartTime) / 1000).toFixed(1);

      kits.push({
        id: validCase.id,
        status: 'ok',
        kit: generatedKit,
        error: null,
      });

      console.log(`[Taro Evaluate] [${validCase.id}] Generation completed in ${caseDuration}s.`);
    } catch (err: any) {
      const caseDuration = ((Date.now() - caseStartTime) / 1000).toFixed(1);
      console.error(`[Taro Evaluate] [${validCase.id}] Failed generation after ${caseDuration}s:`, err?.message || err);

      const code =
        err instanceof TaroError && err.code ? err.code : ErrorCode.CASE_FAILED;

      kits.push({
        id: validCase.id,
        status: 'failed',
        kit: null,
        error: {
          code,
          message: err?.message || 'Case generation failed',
        },
      });
    }
  }

  const elapsedSecs = ((Date.now() - startTime) / 1000).toFixed(1);
  const okCount = kits.filter((k) => k.status === 'ok').length;
  const failCount = kits.filter((k) => k.status === 'failed').length;

  const outputPayload = {
    version: '1.0' as const,
    generated_at: new Date().toISOString(),
    kits,
  };

  // Validate entire output adheres strictly to Appendix B schema
  BatchOutputSchema.parse(outputPayload);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, JSON.stringify(outputPayload, null, 2), 'utf8');

  console.log('\n[Taro Evaluate] ==================== BATCH SUMMARY ====================');
  for (const k of kits) {
    const statusLabel = k.status === 'ok' ? 'OK    ' : 'FAILED';
    const detail =
      k.status === 'ok'
        ? `${k.kit?.questions?.length || 0} questions, ${k.kit?.schedule?.days_available || 0} days`
        : `Error: ${k.error?.code}`;
    console.log(`[Taro Evaluate] ${k.id.padEnd(15)} | ${statusLabel} | ${detail}`);
  }
  console.log('[Taro Evaluate] ========================================================');
  console.log(
    `[Taro Evaluate] Finished: ${kits.length} case(s) evaluated in ${elapsedSecs}s (${okCount} succeeded, ${failCount} failed) -> ${outputPath}`
  );
}

async function main(): Promise<void> {
  const args = minimist(process.argv.slice(2), {
    string: ['input', 'output'],
    boolean: ['mock'],
    alias: { i: 'input', o: 'output', m: 'mock' },
  });

  const inputPath = args.input;
  const outputPath = args.output;
  const isMock = Boolean(args.mock);

  if (!inputPath || !outputPath) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json> [--mock]');
    process.exit(1);
  }

  await runEvaluate(inputPath, outputPath, { mock: isMock });
}

// Run CLI when called directly
if (require.main === module) {
  main().catch((err) => {
    console.error('[Taro Evaluate] Fatal error:', err);
    process.exit(1);
  });
}

/**
 * Section 9 — Batch Evaluation Entry Point
 * Command: npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Requirements:
 *  - Reads an array of cases (each with id, jd, company_url, days).
 *  - Evaluates each case individually.
 *  - Continues after one case fails, recording the failure rather than aborting the run.
 *  - Writes single JSON file in Appendix B shape.
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

export async function runEvaluate(inputPath: string, outputPath: string): Promise<void> {
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

  console.log(`[Taro Evaluate] Loaded ${rawData.length} raw case(s) from ${inputPath}`);

  const kits: BatchKitEntry[] = [];

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

      console.warn(`[Taro Evaluate] Case "${caseId}" failed input validation: ${errorMsg}`);

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

    // Process valid case (generateKit from @taro/core will be connected in D8)
    kits.push({
      id: validCase.id,
      status: 'failed',
      kit: null,
      error: {
        code: ErrorCode.CASE_FAILED,
        message: 'Core generation pipeline pending implementation (Milestone D2-D5).',
      },
    });
  }

  const outputPayload = {
    version: '1.0' as const,
    generated_at: new Date().toISOString(),
    kits,
  };

  // Validate entire output adheres strictly to Appendix B schema
  BatchOutputSchema.parse(outputPayload);

  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, JSON.stringify(outputPayload, null, 2), 'utf8');

  console.log(`[Taro Evaluate] Successfully evaluated ${kits.length} case(s) -> ${outputPath}`);
}

async function main(): Promise<void> {
  const args = minimist(process.argv.slice(2), {
    string: ['input', 'output'],
    alias: { i: 'input', o: 'output' },
  });

  const inputPath = args.input;
  const outputPath = args.output;

  if (!inputPath || !outputPath) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }

  await runEvaluate(inputPath, outputPath);
}

// Run CLI when called directly
if (require.main === module) {
  main().catch((err) => {
    console.error('[Taro Evaluate] Fatal error:', err);
    process.exit(1);
  });
}

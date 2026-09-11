/**
 * Domain 3: End-to-End Kit Generation Orchestrator
 * Integrates JD requirement extraction, real-time company crawling, brief synthesis,
 * question generation, flashcard deck building, study scheduling, and validation.
 */
import {
  Kit,
  KitSchema,
  Role,
  Requirement,
  CompanyBrief,
  Question,
  Flashcard,
  Schedule,
  Coverage,
  ErrorCode,
  TaroError,
} from '@taro/shared';
import { extractRequirements } from './step1-extract';
import { synthesizeCompanyBrief } from './step2-brief';
import { generateQuestionsForRequirements } from './step3-questions';
import { generateFlashcards } from './step4-flashcards';
import { validateDraftKitEnvelope } from './validation-gate';
import { crawlCompany } from '../crawler/research-orchestrator';
import { LlmClient, getDefaultLlmClient } from '../llm/client';
import { matchCuratedQuestions } from './curated-questions';
import { PipelineProgress } from './types';
import {
  buildSchedule,
  checkCoverage,
  buildCoverageEnvelope,
  executeSecondPassGapFill,
} from '../deterministic';

export interface GenerateKitParams {
  jd: string;
  companyUrl: string;
  days: number;
  roleTitle?: string;
  client?: LlmClient;
  mock?: boolean;
  onProgress?: (progress: PipelineProgress) => void;
}

/**
 * Builds a deterministic contiguous-block Day-by-Day study schedule strictly adhering to ScheduleSchema.
 */
export function buildStudySchedule(
  questions: Question[],
  daysAvailable: number,
  requirements: Requirement[] = []
): Schedule {
  return buildSchedule(questions, requirements, daysAvailable);
}

/**
 * Computes coverage matrix tracking covered and uncovered requirement IDs.
 */
export function buildCoverage(
  role: Role,
  questions: Question[],
  passes: number = 1
): Coverage {
  const result = checkCoverage(role.requirements, questions);
  return buildCoverageEnvelope(result.uncoveredIds, passes);
}

/**
 * Generates a complete, validated Appendix A Interview Preparation Kit.
 */
export async function generateKit(params: GenerateKitParams): Promise<Kit> {
  const { jd, companyUrl, days, roleTitle, mock } = params;

  if (!jd || typeof jd !== 'string' || jd.trim().length === 0) {
    throw new TaroError(ErrorCode.INVALID_INPUT, 'Job description cannot be empty');
  }

  if (!companyUrl || typeof companyUrl !== 'string' || companyUrl.trim().length === 0) {
    throw new TaroError(ErrorCode.INVALID_INPUT, 'Company URL cannot be empty');
  }

  if (typeof days !== 'number' || isNaN(days) || days < 1 || days > 60) {
    throw new TaroError(
      ErrorCode.INVALID_INPUT,
      `Days available must be an integer between 1 and 60. Got: ${days}`
    );
  }

  const onProgress = params.onProgress;
  const client = params.client || getDefaultLlmClient({ mock });

  // ── Step 1: Extract Role & Requirements from JD ─────────────────────────────
  if (onProgress) {
    onProgress({
      step: 'extract',
      percent: 15,
      message: 'Extracting discrete requirements and seniority from job description...',
    });
  }

  const extractResult = await extractRequirements(jd, {
    client,
    mock,
    onProgress,
  });

  const role: Role = {
    ...extractResult.role,
    title: roleTitle?.trim() || extractResult.role.title,
  };

  // ── Step 2: Company Reconnaissance Crawl (Domain 2) ─────────────────────────
  if (onProgress) {
    onProgress({
      step: 'crawl',
      percent: 35,
      message: `Executing SSRF-shielded reconnaissance on ${companyUrl}...`,
    });
  }

  const research = await crawlCompany(companyUrl.trim(), {
    maxPages: 5,
    allowLocalhost:
      mock ||
      process.env.NODE_ENV === 'test' ||
      process.env.TARO_CLI_MODE === 'evaluate',
  });

  // ── Step 3: Synthesize Role-Grounded Company Brief ──────────────────────────
  if (onProgress) {
    onProgress({
      step: 'brief',
      percent: 55,
      message: 'Synthesizing grounded company intelligence brief...',
    });
  }

  const briefResult = await synthesizeCompanyBrief(companyUrl.trim(), research, {
    client,
    mock,
    onProgress,
  });

  // ── Step 4: Hybrid Question Bank Generation (Curated Pool + LLM Generation) ─
  if (onProgress) {
    onProgress({
      step: 'questions',
      percent: 75,
      message: 'Matching curated question pool and generating company-targeted questions...',
    });
  }

  // 4a. Match curated templates against requirements (assigns q1..qk)
  const curatedMatch = matchCuratedQuestions(role.requirements, 1, 3);
  const curatedQuestions = curatedMatch.questions;

  // 4b. Generate company-specific and gap-filling questions via LLM starting at next index
  const questionsResult = await generateQuestionsForRequirements(
    role.requirements,
    briefResult.brief,
    {
      client,
      mock,
      nextQuestionIndex: curatedMatch.nextQuestionIndex,
      researchResult: research,
      roleTitle: role.title,
      roleSeniority: role.seniority,
      onProgress,
    }
  );

  const initialQuestions = [...curatedQuestions, ...questionsResult.questions];

  // ── Step 4c: Domain 4.2 Deterministic Second-Pass Gap Fill ──────────────────
  const gapFillResult = await executeSecondPassGapFill({
    requirements: role.requirements,
    initialQuestions,
    brief: briefResult.brief,
    client,
    mock,
    nextQuestionIndex: questionsResult.nextQuestionIndex,
    roleTitle: role.title,
    roleSeniority: role.seniority,
    researchResult: research,
    onProgress,
  });

  const questions = gapFillResult.questions;
  const coverage = gapFillResult.coverage;

  // ── Step 5: Generate Rapid-Revision Flashcards ──────────────────────────────
  if (onProgress) {
    onProgress({
      step: 'flashcards',
      percent: 88,
      message: 'Synthesizing rapid-revision flashcards...',
    });
  }

  const flashcardsResult = await generateFlashcards(role.requirements, questions, {
    client,
    mock,
    onProgress,
  });

  const flashcards = flashcardsResult.flashcards;

  // ── Step 6: Pre-Handoff Validation Gate ─────────────────────────────────────
  validateDraftKitEnvelope({
    role,
    company_brief: briefResult.brief,
    questions,
    flashcards,
  });

  // ── Step 7: Build Day-by-Day Schedule & Coverage Matrix ─────────────────────
  if (onProgress) {
    onProgress({
      step: 'schedule',
      percent: 95,
      message: 'Constructing day-by-day study schedule and final validation...',
    });
  }

  const schedule = buildSchedule(questions, role.requirements, days);

  const kit: Kit = {
    source: {
      company: research.companyName?.trim() || new URL(companyUrl.trim()).hostname.replace(/^www\./, ''),
      company_url: companyUrl.trim(),
      role: role.title,
      location: '',
      jd_chars: jd.trim().length,
      researched_at: new Date().toISOString(),
      pages_used:
        briefResult.pagesUsed.length > 0
          ? briefResult.pagesUsed
          : research.pages?.map((p) => p.url) || [],
    },
    company_brief: briefResult.brief,
    role,
    questions,
    flashcards,
    schedule,
    coverage,
  };

  // Enforce full Appendix A validation
  KitSchema.parse(kit);

  if (onProgress) {
    onProgress({
      step: 'complete',
      percent: 100,
      message: 'Interview preparation kit generated and verified successfully!',
    });
  }

  return kit;
}

/**
 * Domain 4.2: Deterministic Second-Pass Gap Fill
 * Evaluates coverage of Must-Have requirements after initial question generation.
 * If gaps remain, triggers a single targeted second-pass generation specifically
 * for uncovered must-have requirements, capped strictly at 2 passes maximum.
 */
import {
  Requirement,
  Question,
  CompanyBrief,
  Coverage,
} from '@taro/shared';
import { CompanyResearchResult } from '../crawler/types';
import { checkCoverage, buildCoverageEnvelope, CoverageResult } from './coverage-checker';
import { generateQuestionsForRequirements } from '../pipeline/step3-questions';
import { PipelineProgressEvent } from '../pipeline/types';
import { LlmClient } from '../llm/client';

export interface SecondPassGapFillParams {
  requirements: Requirement[];
  initialQuestions: Question[];
  brief: CompanyBrief;
  client?: LlmClient;
  mock?: boolean;
  nextQuestionIndex?: number;
  roleTitle?: string;
  roleSeniority?: string;
  researchResult?: CompanyResearchResult;
  onProgress?: (progress: PipelineProgressEvent) => void;
}

export interface SecondPassGapFillResult {
  questions: Question[];
  coverage: Coverage;
  passes: number;
  nextQuestionIndex: number;
  gapQuestionsGenerated: number;
  coverageDetails: CoverageResult;
}

/**
 * Executes a deterministic single-conditional gap fill.
 * If all must-have requirements are satisfied, passes = 1.
 * If any must-have requirements are uncovered, triggers exactly one targeted pass
 * for those specific requirements, resulting in passes = 2.
 */
export async function executeSecondPassGapFill(
  params: SecondPassGapFillParams
): Promise<SecondPassGapFillResult> {
  const {
    requirements,
    initialQuestions,
    brief,
    client,
    mock,
    nextQuestionIndex,
    roleTitle,
    roleSeniority,
    researchResult,
    onProgress,
  } = params;

  // Pass 1: Evaluate baseline coverage
  const pass1Coverage = checkCoverage(requirements, initialQuestions);

  // If no must-have requirements remain uncovered, exit early with passes = 1
  if (!pass1Coverage.hasMustGaps) {
    return {
      questions: initialQuestions,
      coverage: buildCoverageEnvelope(pass1Coverage.uncoveredIds, 1),
      passes: 1,
      nextQuestionIndex: nextQuestionIndex ?? (initialQuestions.length + 1),
      gapQuestionsGenerated: 0,
      coverageDetails: pass1Coverage,
    };
  }

  // Pass 2: Targeted generation for uncovered must-have requirements only
  const missingMustRequirements = requirements.filter((r) =>
    pass1Coverage.uncoveredMustIds.includes(r.id)
  );

  if (onProgress) {
    onProgress({
      step: 'questions',
      percent: 82,
      message: `Second pass: Generating targeted questions for ${missingMustRequirements.length} uncovered must-have requirement(s)...`,
    });
  }

  const currentIndex = nextQuestionIndex ?? (initialQuestions.length + 1);

  const secondPassResult = await generateQuestionsForRequirements(
    missingMustRequirements,
    brief,
    {
      client,
      mock,
      nextQuestionIndex: currentIndex,
      roleTitle,
      roleSeniority,
      researchResult,
      onProgress,
    }
  );

  const combinedQuestions = [...initialQuestions, ...secondPassResult.questions];
  const finalCoverage = checkCoverage(requirements, combinedQuestions);

  return {
    questions: combinedQuestions,
    coverage: buildCoverageEnvelope(finalCoverage.uncoveredIds, 2),
    passes: 2,
    nextQuestionIndex: secondPassResult.nextQuestionIndex,
    gapQuestionsGenerated: secondPassResult.questions.length,
    coverageDetails: finalCoverage,
  };
}

/**
 * Domain 6: Core Section Regeneration Engine
 *
 * Implements granular, single-section regeneration:
 * 1. Category question regeneration (preserving _edited and _manual questions, gap filling, rebuilding schedule).
 * 2. Company brief regeneration (singleton overwrite with CONFIRMATION_REQUIRED gate).
 * 3. Flashcard regeneration (preserving _edited and _manual flashcards).
 *
 * Enforces pre-commit validation gates with KitSchema.parse(), leaving original kit untouched on error.
 */
import {
  Kit,
  KitSchema,
  Question,
  QuestionCategory,
  Flashcard,
  TaroError,
  ErrorCode,
  nextOffsetFromIds,
} from '@taro/shared';
import { generateQuestionsForCategory } from '../pipeline/step3-questions';
import { synthesizeCompanyBrief } from '../pipeline/step2-brief';
import { generateFlashcards } from '../pipeline/step4-flashcards';
import { checkCoverage, buildCoverageEnvelope } from '../deterministic/coverage-checker';
import { buildSchedule } from '../deterministic/scheduler';
import { PipelineOptions, PipelineProgressEvent } from '../pipeline/types';
import { getCachedResearch } from '../crawler/research-orchestrator';
import { CompanyResearchResult } from '../crawler/types';

export interface RegenerationOptions extends PipelineOptions {
  nextQuestionIndex?: number;
  nextFlashcardIndex?: number;
  force?: boolean;
}

export interface RegenerateQuestionsResult {
  kit: Kit;
  nextQuestionIndex: number;
  newQuestionsCount: number;
}

export interface RegenerateBriefResult {
  kit: Kit;
}

export interface RegenerateFlashcardsResult {
  kit: Kit;
  nextFlashcardIndex: number;
  newFlashcardsCount: number;
}

/**
 * Regenerates a specific question category slice while unconditionally preserving
 * all hand-edited (_edited: true) and manually-added (_manual: true) questions.
 */
export async function regenerateQuestionsCategory(
  currentKit: Kit,
  category: QuestionCategory,
  options: RegenerationOptions = {}
): Promise<RegenerateQuestionsResult> {
  const existingQuestions = currentKit.questions || [];

  // 1. Partition into protected questions in target category, other category questions, and unprotected questions
  const protectedInCat: Question[] = [];
  const otherCategoryQuestions: Question[] = [];

  for (const q of existingQuestions) {
    if (q.category === category) {
      if (q._edited === true || q._manual === true) {
        protectedInCat.push(q);
      }
    } else {
      otherCategoryQuestions.push(q);
    }
  }

  // 2. Compute requirement gaps: requirements not covered by protected questions in this category
  const protectedCoveredReqIds = new Set<string>();
  for (const q of protectedInCat) {
    for (const rid of q.requirement_ids || []) {
      protectedCoveredReqIds.add(rid);
    }
  }

  // Filter role requirements: prioritize matching category kind or uncovered requirements
  let targetReqs = currentKit.role.requirements.filter((r) => !protectedCoveredReqIds.has(r.id));
  if (targetReqs.length === 0) {
    // If all requirements are already covered by protected items, target category-appropriate requirements
    targetReqs = currentKit.role.requirements;
  }

  // 3. Calculate monotonic starting ID offset
  const existingQIds = existingQuestions.map((q) => q.id);
  const startQIndex = Math.max(
    options.nextQuestionIndex || 1,
    nextOffsetFromIds('q', existingQIds) + 1
  );

  // 4. Synthesize new questions specifically for the target category
  const generatedResult = await generateQuestionsForCategory(
    category,
    targetReqs,
    currentKit.company_brief,
    {
      ...options,
      nextQuestionIndex: startQIndex,
    }
  );

  const newQuestions = generatedResult.questions;
  const nextQuestionIndex = generatedResult.nextQuestionIndex;

  // 5. Lossless Array Merge: Keep protected items + newly generated items
  const mergedCategoryQuestions = [...protectedInCat, ...newQuestions];
  const mergedAllQuestions = [...otherCategoryQuestions, ...mergedCategoryQuestions];

  // 6. Recalculate deterministic Coverage & Day-by-day Study Schedule
  const coverageResult = checkCoverage(currentKit.role.requirements, mergedAllQuestions);
  const coverageEnvelope = buildCoverageEnvelope(
    coverageResult.uncoveredIds,
    currentKit.coverage?.passes || 1
  );

  const daysCount =
    currentKit.schedule?.days_available ||
    currentKit.schedule?.days?.length ||
    7;
  const schedule = buildSchedule(mergedAllQuestions, currentKit.role.requirements, daysCount);

  // 7. Assemble draft merged kit
  const mergedKit: Kit = {
    ...currentKit,
    questions: mergedAllQuestions,
    coverage: coverageEnvelope,
    schedule,
  };

  // 8. Pre-Commit Referential Integrity Validation Gate
  try {
    KitSchema.parse(mergedKit);
  } catch (err) {
    throw new TaroError(
      ErrorCode.KIT_SCHEMA_INVALID,
      `Section regeneration failed schema validation gate: ${(err as Error).message}`,
      err
    );
  }

  return {
    kit: mergedKit,
    nextQuestionIndex,
    newQuestionsCount: newQuestions.length,
  };
}

/**
 * Regenerates the company brief singleton.
 * Requires force: true if the brief was previously customized by the candidate.
 */
export async function regenerateCompanyBrief(
  currentKit: Kit,
  options: RegenerationOptions = {}
): Promise<RegenerateBriefResult> {
  // 1. Singleton Confirmation Gate: Prevent silent overwrite of user edits
  if (currentKit.company_brief._edited === true && !options.force) {
    throw new TaroError(
      ErrorCode.CONFIRMATION_REQUIRED,
      'Company brief contains hand-edits. Pass force: true to overwrite.'
    );
  }

  // 2. Retrieve research context or fallback
  const companyUrl = currentKit.source.company_url;
  const cachedResearch = getCachedResearch(companyUrl);

  const fallbackResearch: CompanyResearchResult = cachedResearch || {
    companyName: currentKit.source.company,
    domain: new URL(companyUrl).hostname.replace(/^www\./, ''),
    rootUrl: companyUrl,
    pages: (currentKit.source.pages_used || []).map((url) => ({
      url,
      title: 'Crawled Page',
      text: '',
      html: '',
      cleanText: '',
      depth: 0,
      charCount: 0,
    })),
    skippedPages: [],
    cultureKeywords: [],
    engineeringTechStack: [],
    interviewInsights: [],
    warnings: [],
    crawledAt: new Date().toISOString(),
    insightsIncluded: false,
    durationMs: 0,
  };

  // 3. Synthesize new company brief
  const briefResult = await synthesizeCompanyBrief(companyUrl, fallbackResearch, options);

  // 4. Merge: overwrite brief and reset _edited flag on commit
  const mergedKit: Kit = {
    ...currentKit,
    company_brief: {
      ...briefResult.brief,
      _edited: false,
    },
    source: {
      ...currentKit.source,
      pages_used:
        briefResult.pagesUsed.length > 0
          ? briefResult.pagesUsed
          : currentKit.source.pages_used,
    },
  };

  // 5. Pre-Commit Validation Gate
  try {
    KitSchema.parse(mergedKit);
  } catch (err) {
    throw new TaroError(
      ErrorCode.KIT_SCHEMA_INVALID,
      `Company brief regeneration failed schema validation: ${(err as Error).message}`,
      err
    );
  }

  return { kit: mergedKit };
}

/**
 * Regenerates the flashcard deck while preserving hand-edited and manual flashcards.
 */
export async function regenerateFlashcards(
  currentKit: Kit,
  options: RegenerationOptions = {}
): Promise<RegenerateFlashcardsResult> {
  const existingCards = currentKit.flashcards || [];

  // 1. Partition into protected flashcards and unprotected ones
  const protectedCards: Flashcard[] = [];
  for (const f of existingCards) {
    if (f._edited === true || f._manual === true) {
      protectedCards.push(f);
    }
  }

  // 2. Compute covered requirements
  const coveredReqIds = new Set<string>();
  for (const f of protectedCards) {
    for (const rid of f.requirement_ids || []) {
      coveredReqIds.add(rid);
    }
  }

  // 3. Target requirements
  let targetReqs = currentKit.role.requirements.filter((r) => !coveredReqIds.has(r.id));
  if (targetReqs.length === 0) {
    targetReqs = currentKit.role.requirements;
  }

  // 4. Starting ID offset
  const existingFIds = existingCards.map((f) => f.id);
  const startFIndex = Math.max(
    options.nextFlashcardIndex || 1,
    nextOffsetFromIds('f', existingFIds) + 1
  );

  // 5. Synthesize new flashcards
  const flashcardsResult = await generateFlashcards(targetReqs, currentKit.questions, {
    ...options,
    nextFlashcardIndex: startFIndex,
  });

  const newCards = flashcardsResult.flashcards;
  const nextFlashcardIndex = flashcardsResult.nextFlashcardIndex;

  // 6. Lossless Array Merge
  const mergedCards = [...protectedCards, ...newCards];

  const mergedKit: Kit = {
    ...currentKit,
    flashcards: mergedCards,
  };

  // 7. Validation Gate
  try {
    KitSchema.parse(mergedKit);
  } catch (err) {
    throw new TaroError(
      ErrorCode.KIT_SCHEMA_INVALID,
      `Flashcard regeneration failed schema validation: ${(err as Error).message}`,
      err
    );
  }

  return {
    kit: mergedKit,
    nextFlashcardIndex,
    newFlashcardsCount: newCards.length,
  };
}

/**
 * Clean export helper: strips internal underscore metadata fields (_edited, _manual)
 * for strictly pure Appendix A emission.
 */
export function cleanKitForExport(kit: Kit): Kit {
  const clean = JSON.parse(JSON.stringify(kit));
  if (clean.company_brief && '_edited' in clean.company_brief) {
    delete clean.company_brief._edited;
  }
  if (Array.isArray(clean.questions)) {
    for (const q of clean.questions) {
      delete q._edited;
      delete q._manual;
    }
  }
  if (Array.isArray(clean.flashcards)) {
    for (const f of clean.flashcards) {
      delete f._edited;
      delete f._manual;
    }
  }
  return clean;
}

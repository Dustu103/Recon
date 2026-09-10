/**
 * Domain 4.1: Deterministic Coverage Checker
 * Computes coverage matrix tracking covered and uncovered requirement IDs,
 * differentiating Must-Have vs Nice-to-Have requirements.
 */
import { Requirement, Question, Coverage } from '@taro/shared';

export interface CoverageResult {
  /** All requirement IDs that have 0 questions covering them */
  uncoveredIds: string[];
  /** Must-have requirement IDs that have 0 questions covering them */
  uncoveredMustIds: string[];
  /** Nice-to-have requirement IDs that have 0 questions covering them */
  uncoveredNiceIds: string[];
  /** Count of must-have requirements covered by at least one question */
  coveredMustCount: number;
  /** Total count of must-have requirements */
  totalMustCount: number;
  /** True if every requirement (must and nice) is covered */
  isFullyCovered: boolean;
  /** True if at least one must-have requirement lacks coverage */
  hasMustGaps: boolean;
  /** Overall coverage percentage (0 to 100) */
  coveragePercentage: number;
}

/**
 * Evaluates whether all discrete requirements extracted from the JD are covered
 * by at least one question in the question bank.
 */
export function checkCoverage(
  requirements: Requirement[],
  questions: Question[]
): CoverageResult {
  // Collect all requirement IDs referenced across all questions
  const coveredSet = new Set<string>();
  for (const q of questions) {
    if (Array.isArray(q.requirement_ids)) {
      for (const rId of q.requirement_ids) {
        coveredSet.add(rId);
      }
    }
  }

  const uncoveredIds: string[] = [];
  const uncoveredMustIds: string[] = [];
  const uncoveredNiceIds: string[] = [];
  let totalMustCount = 0;
  let coveredMustCount = 0;

  for (const req of requirements) {
    const isMust = req.priority === 'must';
    if (isMust) {
      totalMustCount++;
    }

    if (coveredSet.has(req.id)) {
      if (isMust) {
        coveredMustCount++;
      }
    } else {
      uncoveredIds.push(req.id);
      if (isMust) {
        uncoveredMustIds.push(req.id);
      } else {
        uncoveredNiceIds.push(req.id);
      }
    }
  }

  const totalCount = requirements.length;
  const coveredCount = totalCount - uncoveredIds.length;
  const coveragePercentage =
    totalCount > 0 ? Math.round((coveredCount / totalCount) * 100) : 100;

  return {
    uncoveredIds,
    uncoveredMustIds,
    uncoveredNiceIds,
    coveredMustCount,
    totalMustCount,
    isFullyCovered: uncoveredIds.length === 0,
    hasMustGaps: uncoveredMustIds.length > 0,
    coveragePercentage,
  };
}

/**
 * Builds a strict Appendix A Coverage envelope.
 */
export function buildCoverageEnvelope(
  uncoveredIds: string[],
  passes: number = 1
): Coverage {
  return {
    uncovered_requirement_ids: uncoveredIds,
    passes: Math.max(1, Math.min(2, Math.floor(passes))),
  };
}

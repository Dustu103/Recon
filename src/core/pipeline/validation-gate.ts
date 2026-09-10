/**
 * Domain 3: Pre-D4 Handoff Validation Gate
 * Formally validates intermediate kit draft against Appendix A contracts,
 * asserting type shapes, referential integrity, and difficulty bounds before handing off to Domain 4.
 */
import {
  RoleSchema,
  CompanyBriefSchema,
  QuestionSchema,
  FlashcardSchema,
  ErrorCode,
  TaroError,
} from '@taro/shared';
import { DraftKitEnvelope } from './types';
import { z } from 'zod';

export function validateDraftKitEnvelope(envelope: DraftKitEnvelope): void {
  // 1. Validate Core Schema Shapes
  try {
    RoleSchema.parse(envelope.role);
    CompanyBriefSchema.parse(envelope.company_brief);
    z.array(QuestionSchema).parse(envelope.questions);
    z.array(FlashcardSchema).parse(envelope.flashcards);
  } catch (err) {
    throw new TaroError(
      ErrorCode.KIT_SCHEMA_INVALID,
      `Pre-D4 handoff failed schema validation: ${(err as Error).message}`,
      err
    );
  }

  // 2. Strict Referential Integrity Assertions
  const validReqIds = new Set(envelope.role.requirements.map((r) => r.id));

  for (const q of envelope.questions) {
    if (q.requirement_ids.length === 0) {
      throw new TaroError(
        ErrorCode.KIT_SCHEMA_INVALID,
        `Validation gate rejected question "${q.id}": empty requirement_ids array`
      );
    }
    for (const reqId of q.requirement_ids) {
      if (!validReqIds.has(reqId)) {
        throw new TaroError(
          ErrorCode.KIT_SCHEMA_INVALID,
          `Validation gate rejected question "${q.id}": references non-existent requirement_id "${reqId}"`
        );
      }
    }

    // Difficulty bounds
    if (![1, 2, 3].includes(q.difficulty)) {
      throw new TaroError(
        ErrorCode.KIT_SCHEMA_INVALID,
        `Validation gate rejected question "${q.id}": invalid difficulty "${q.difficulty}" (must be integer 1, 2, or 3)`
      );
    }
  }

  for (const f of envelope.flashcards) {
    if (f.requirement_ids.length === 0) {
      throw new TaroError(
        ErrorCode.KIT_SCHEMA_INVALID,
        `Validation gate rejected flashcard "${f.id}": empty requirement_ids array`
      );
    }
    for (const reqId of f.requirement_ids) {
      if (!validReqIds.has(reqId)) {
        throw new TaroError(
          ErrorCode.KIT_SCHEMA_INVALID,
          `Validation gate rejected flashcard "${f.id}": references non-existent requirement_id "${reqId}"`
        );
      }
    }
  }
}

import { getUserKitById } from './kit-scoping';
import {
  TaroError,
  ErrorCode,
  InterviewTurnInput,
  InterviewTurnResponse,
  InterviewReportInput,
  InterviewReport,
} from '@taro/shared';
import { evaluateInterviewTurn, generateInterviewReport } from '@/core';

export class KitInterviewService {
  /**
   * Processes an interactive interview turn: candidate's verbal/typed response and C++/JS code.
   * Scoped to the authenticated tenant user.
   */
  static async handleTurn(
    kitId: string,
    userId: string,
    input: InterviewTurnInput
  ): Promise<InterviewTurnResponse> {
    const kitDoc = await getUserKitById(kitId, userId);
    if (!kitDoc.kit) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Kit has not finished generation yet');
    }

    // Process turn through LLM evaluator
    return evaluateInterviewTurn(input);
  }

  /**
   * Generates a comprehensive session report analyzing pacing, time management,
   * code review, and recurring errors.
   */
  static async handleReport(
    kitId: string,
    userId: string,
    input: InterviewReportInput
  ): Promise<InterviewReport> {
    const kitDoc = await getUserKitById(kitId, userId);
    if (!kitDoc.kit) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Kit has not finished generation yet');
    }

    return generateInterviewReport(input);
  }
}

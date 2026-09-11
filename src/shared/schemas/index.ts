// Barrel for all Appendix A & B schemas
export { SourceSchema } from './source.schema';
export { CompanyBriefSchema } from './company-brief.schema';
export { RequirementSchema } from './requirement.schema';
export { RoleSchema } from './role.schema';
export { QuestionSchema } from './question.schema';
export { FlashcardSchema } from './flashcard.schema';
export { ScheduleSchema } from './schedule.schema';
export { CoverageSchema } from './coverage.schema';
export { KitSchema, BatchOutputSchema, BatchInputSchema, BatchInputCaseSchema } from './kit.schema';
export { RegisterInputSchema, LoginInputSchema, UserPayloadSchema } from './auth.schema';
export type { Source } from './source.schema';
export type { CompanyBrief } from './company-brief.schema';
export type { Requirement } from './requirement.schema';
export type { Role } from './role.schema';
export type { Question, QuestionCategory } from './question.schema';
export type { Flashcard } from './flashcard.schema';
export type { Day, Schedule } from './schedule.schema';
export type { Coverage } from './coverage.schema';
export type { Kit, BatchOutput, BatchKitEntry, BatchInputCase } from './kit.schema';
export type { RegisterInput, LoginInput, UserPayload } from './auth.schema';
export {
  PracticeConfidenceSchema,
  PracticeRatingItemSchema,
  PracticeSessionInputSchema,
  CONFIDENCE_MAP,
  LABEL_TO_CONFIDENCE,
} from './practice.schema';
export type {
  PracticeConfidence,
  ConfidenceLabel,
  PracticeRatingItem,
  PracticeSessionInput,
  PracticeHistoryEntry,
  SpacedRepetitionFilter,
  SpacedRepetitionCard,
  RequirementReadiness,
  WeakSpotRadarAnalysis,
} from './practice.schema';
export {
  InterviewLanguageSchema,
  InterviewCodeSnippetSchema,
  InterviewRoleSchema,
  InterviewMessageSchema,
  InterviewTurnInputSchema,
  InterviewFeedbackSchema,
  InterviewTurnResponseSchema,
  InterviewReportInputSchema,
  InterviewReportSchema,
} from './interview.schema';
export type {
  InterviewLanguage,
  InterviewCodeSnippet,
  InterviewRole,
  InterviewMessage,
  InterviewTurnInput,
  InterviewFeedback,
  InterviewTurnResponse,
  InterviewReportInput,
  InterviewReport,
} from './interview.schema';

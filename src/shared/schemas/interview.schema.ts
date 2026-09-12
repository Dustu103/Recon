import { z } from 'zod';

export const InterviewLanguageSchema = z.enum(['javascript', 'cpp', 'python', 'sql']);
export type InterviewLanguage = z.infer<typeof InterviewLanguageSchema>;

export const InterviewCodeSnippetSchema = z.object({
  language: InterviewLanguageSchema,
  code: z.string().max(10000, 'Code snippet cannot exceed 10,000 characters'),
});
export type InterviewCodeSnippet = z.infer<typeof InterviewCodeSnippetSchema>;

export const InterviewRoleSchema = z.enum(['interviewer', 'candidate']);
export type InterviewRole = z.infer<typeof InterviewRoleSchema>;

export const InterviewMessageSchema = z.object({
  role: InterviewRoleSchema,
  content: z.string().min(1, 'Message content cannot be empty'),
  codeSnippet: InterviewCodeSnippetSchema.optional(),
  timestamp: z.string().optional(),
});
export type InterviewMessage = z.infer<typeof InterviewMessageSchema>;

export const InterviewTurnInputSchema = z.object({
  questionId: z.string().min(1, 'questionId is required'),
  questionPrompt: z.string().min(1, 'questionPrompt is required'),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']).default('technical'),
  userMessage: z.string().default(''),
  codeSnippet: InterviewCodeSnippetSchema.optional(),
  conversationHistory: z.array(InterviewMessageSchema).default([]),
});
export type InterviewTurnInput = z.infer<typeof InterviewTurnInputSchema>;

export const InterviewFeedbackSchema = z.object({
  score: z.number().min(1).max(10).optional(),
  strengths: z.array(z.string()).default([]),
  areasForImprovement: z.array(z.string()).default([]),
  codeAnalysis: z
    .object({
      timeComplexity: z.string().optional(),
      spaceComplexity: z.string().optional(),
      edgeCasesCovered: z.array(z.string()).default([]),
      suggestions: z.array(z.string()).default([]),
    })
    .optional(),
  isComplete: z.boolean().default(false),
});
export type InterviewFeedback = z.infer<typeof InterviewFeedbackSchema>;

export const InterviewTurnResponseSchema = z.object({
  interviewerReply: z.string(),
  feedback: InterviewFeedbackSchema,
});
export type InterviewTurnResponse = z.infer<typeof InterviewTurnResponseSchema>;

// --- Session Performance & Recurring Errors Report ---

export const InterviewReportInputSchema = z.object({
  questionId: z.string().min(1),
  questionPrompt: z.string().min(1),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']).default('technical'),
  durationSeconds: z.number().min(0),
  conversationHistory: z.array(InterviewMessageSchema).default([]),
  codeSnippet: InterviewCodeSnippetSchema.optional(),
});
export type InterviewReportInput = z.infer<typeof InterviewReportInputSchema>;

export const InterviewReportSchema = z.object({
  overallScore: z.number().min(1).max(100),
  durationFormatted: z.string(),
  pacingEvaluation: z.string(),
  executiveSummary: z.string(),
  strengths: z.array(z.string()),
  areasForImprovement: z.array(z.string()),
  repeatingErrors: z.array(z.string()),
  codeReview: z
    .object({
      language: InterviewLanguageSchema.optional(),
      timeComplexity: z.string().optional(),
      spaceComplexity: z.string().optional(),
      algorithmicVerdict: z.string().optional(),
      syntaxAndQuality: z.array(z.string()).default([]),
    })
    .optional(),
  actionablePracticePlan: z.array(z.string()),
});
export type InterviewReport = z.infer<typeof InterviewReportSchema>;

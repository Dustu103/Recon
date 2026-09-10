/**
 * Domain 3: Pipeline Stage Interfaces & Types
 */
import { Role, CompanyBrief, Question, Flashcard, CompanyResearchResult } from '@taro/shared';
import { LlmClient } from '../llm/client';

export interface PipelineProgressEvent {
  step: 'extract' | 'brief' | 'questions' | 'flashcards' | 'validation';
  percent: number;
  message: string;
}

export interface PipelineOptions {
  client?: LlmClient;
  onProgress?: (event: PipelineProgressEvent) => void;
  mock?: boolean;
}

export interface Step1ExtractResult {
  role: Role;
  nextRequirementIndex: number;
  isThinJd: boolean;
}

export interface Step2BriefResult {
  brief: CompanyBrief;
  pagesUsed: string[];
}

export interface Step3QuestionsOptions extends PipelineOptions {
  nextQuestionIndex?: number;
  roleTitle?: string;
  roleSeniority?: string;
  researchResult?: CompanyResearchResult;
  degradations?: string[];
}

export interface Step3QuestionsResult {
  questions: Question[];
  nextQuestionIndex: number;
  degradations: string[];
}

export interface Step4FlashcardsOptions extends PipelineOptions {
  nextFlashcardIndex?: number;
}

export interface Step4FlashcardsResult {
  flashcards: Flashcard[];
  nextFlashcardIndex: number;
}

export interface DraftKitEnvelope {
  role: Role;
  company_brief: CompanyBrief;
  questions: Question[];
  flashcards: Flashcard[];
  nextRequirementIndex: number;
  nextQuestionIndex: number;
  nextFlashcardIndex: number;
  degradations: string[];
}

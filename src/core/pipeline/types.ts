/**
 * Domain 3: Pipeline Stage Interfaces & Types
 */
import { Role, CompanyBrief, Question, Flashcard } from '@taro/shared';
import { CompanyResearchResult } from '../crawler/types';
import { LlmClient } from '../llm/client';

export interface PipelineProgressEvent {
  step: 'extract' | 'crawl' | 'brief' | 'questions' | 'flashcards' | 'validation' | 'schedule' | 'complete';
  percent: number;
  message: string;
}

export type PipelineProgress = PipelineProgressEvent;

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
  nextRequirementIndex?: number;
  nextQuestionIndex?: number;
  nextFlashcardIndex?: number;
  degradations?: string[];
}

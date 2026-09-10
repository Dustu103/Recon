import { apiFetch, ApiClientError } from './api';
import { Question, Flashcard, CompanyBrief, QuestionCategory } from '@taro/shared';

export interface PatchQuestionInput {
  prompt?: string;
  answer_outline?: string;
  difficulty?: 1 | 2 | 3;
  category?: QuestionCategory;
}

export interface AddQuestionInput {
  category: QuestionCategory;
  prompt: string;
  answer_outline: string;
  difficulty?: 1 | 2 | 3;
  requirement_ids?: string[];
}

export interface PatchCompanyBriefInput {
  summary?: string;
  what_they_do?: string;
}

export interface PatchFlashcardInput {
  front?: string;
  back?: string;
}

export interface AddFlashcardInput {
  front: string;
  back: string;
  requirement_ids?: string[];
}

export interface RegenerateSectionInput {
  section: 'questions' | 'flashcards' | 'company_brief';
  category?: QuestionCategory;
  force?: boolean;
}

export interface CandidateProgressUpdate {
  questionId?: string;
  note?: string;
  starred?: boolean;
  flashcardId?: string;
  mastered?: boolean;
  completedDay?: { dayNumber: number; isCompleted: boolean } | number;
  [key: string]: any;
}

export const kitBuilderApi = {
  async patchQuestion(
    kitId: string,
    questionId: string,
    input: PatchQuestionInput
  ): Promise<{ success: boolean; question: Question }> {
    return apiFetch<{ success: boolean; question: Question }>(
      `/api/kits/${kitId}/questions/${questionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },

  async addManualQuestion(
    kitId: string,
    input: AddQuestionInput
  ): Promise<{ success: boolean; question: Question }> {
    return apiFetch<{ success: boolean; question: Question }>(
      `/api/kits/${kitId}/questions`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  },

  async deleteQuestion(
    kitId: string,
    questionId: string
  ): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      `/api/kits/${kitId}/questions/${questionId}`,
      {
        method: 'DELETE',
      }
    );
  },

  async reorderQuestions(
    kitId: string,
    category: QuestionCategory,
    orderedIds: string[]
  ): Promise<{ success: boolean; questions: Question[] }> {
    return apiFetch<{ success: boolean; questions: Question[] }>(
      `/api/kits/${kitId}/questions/reorder`,
      {
        method: 'PATCH',
        body: JSON.stringify({ category, orderedIds }),
      }
    );
  },

  async patchCompanyBrief(
    kitId: string,
    input: PatchCompanyBriefInput
  ): Promise<{ success: boolean; company_brief: CompanyBrief }> {
    return apiFetch<{ success: boolean; company_brief: CompanyBrief }>(
      `/api/kits/${kitId}/company-brief`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },

  async patchFlashcard(
    kitId: string,
    flashcardId: string,
    input: PatchFlashcardInput
  ): Promise<{ success: boolean; flashcard: Flashcard }> {
    return apiFetch<{ success: boolean; flashcard: Flashcard }>(
      `/api/kits/${kitId}/flashcards/${flashcardId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },

  async addManualFlashcard(
    kitId: string,
    input: AddFlashcardInput
  ): Promise<{ success: boolean; flashcard: Flashcard }> {
    return apiFetch<{ success: boolean; flashcard: Flashcard }>(
      `/api/kits/${kitId}/flashcards`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  },

  async deleteFlashcard(
    kitId: string,
    flashcardId: string
  ): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(
      `/api/kits/${kitId}/flashcards/${flashcardId}`,
      {
        method: 'DELETE',
      }
    );
  },

  async regenerateSection(
    kitId: string,
    input: RegenerateSectionInput
  ): Promise<{ success: boolean; kitId: string; status: string; progressUrl: string; isExisting?: boolean }> {
    return apiFetch<{
      success: boolean;
      kitId: string;
      status: string;
      progressUrl: string;
      isExisting?: boolean;
    }>(`/api/kits/${kitId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateCandidateProgress(
    kitId: string,
    input: CandidateProgressUpdate
  ): Promise<{ success: boolean; progress: any }> {
    return apiFetch<{ success: boolean; progress: any }>(
      `/api/kits/${kitId}/candidate-progress`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },
};

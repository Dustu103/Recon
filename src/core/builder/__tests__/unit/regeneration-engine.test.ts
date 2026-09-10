import { describe, it, expect } from 'vitest';
import {
  regenerateQuestionsCategory,
  regenerateCompanyBrief,
  regenerateFlashcards,
  cleanKitForExport,
} from '../../regeneration-engine';
import { Kit, TaroError, ErrorCode } from '@taro/shared';

describe('Domain 6: Core Regeneration Engine', () => {
  const createMockKit = (): Kit => ({
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Staff Engineer',
      location: 'Remote',
      jd_chars: 500,
      researched_at: new Date().toISOString(),
      pages_used: ['https://acme.com/careers'],
    },
    company_brief: {
      summary: 'Acme builds developer infrastructure.',
      what_they_do: 'Cloud observability tools.',
      sources: ['https://acme.com'],
    },
    role: {
      title: 'Staff Engineer',
      seniority: 'Staff',
      responsibilities: ['Architect services'],
      requirements: [
        { id: 'r1', text: 'Distributed systems experience', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Kubernetes and Go', kind: 'technical', priority: 'must' },
        { id: 'r3', text: 'Cross-functional leadership', kind: 'behavioural', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Original unedited technical question 1',
        answer_outline: 'Outline 1',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'technical',
        prompt: 'Hand-edited technical question 2',
        answer_outline: 'Customized outline',
        difficulty: 3,
        _edited: true,
      },
      {
        id: 'q3',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Manually added technical question 3',
        answer_outline: 'Manual outline',
        difficulty: 1,
        _manual: true,
      },
      {
        id: 'q4',
        requirement_ids: ['r3'],
        category: 'behavioural',
        prompt: 'Behavioural question 4',
        answer_outline: 'STAR response',
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is Raft consensus?',
        back: '• Leader election\n• Log replication',
        requirement_ids: ['r1'],
      },
      {
        id: 'f2',
        front: 'Hand-crafted flashcard?',
        back: '• User notes',
        requirement_ids: ['r2'],
        _manual: true,
      },
    ],
    schedule: {
      days_available: 3,
      days: [
        { day: 1, focus: 'technical', question_ids: ['q2', 'q1'], minutes: 60 },
        { day: 2, focus: 'technical', question_ids: ['q3'], minutes: 45 },
        { day: 3, focus: 'behavioural', question_ids: ['q4'], minutes: 30 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  });

  describe('regenerateQuestionsCategory', () => {
    it('unconditionally preserves _edited and _manual questions while refreshing unprotected ones', async () => {
      const kit = createMockKit();

      const result = await regenerateQuestionsCategory(kit, 'technical', {
        mock: true,
        nextQuestionIndex: 10,
      });

      const technicalQuestions = result.kit.questions.filter((q) => q.category === 'technical');

      // q2 (_edited: true) and q3 (_manual: true) must survive
      const survivedQ2 = technicalQuestions.find((q) => q.id === 'q2');
      const survivedQ3 = technicalQuestions.find((q) => q.id === 'q3');
      expect(survivedQ2).toBeDefined();
      expect(survivedQ2?.prompt).toBe('Hand-edited technical question 2');
      expect(survivedQ2?._edited).toBe(true);

      expect(survivedQ3).toBeDefined();
      expect(survivedQ3?.prompt).toBe('Manually added technical question 3');
      expect(survivedQ3?._manual).toBe(true);

      // q1 was unprotected in technical category -> replaced
      const survivedQ1 = technicalQuestions.find((q) => q.id === 'q1');
      expect(survivedQ1).toBeUndefined();

      // Behavioural question q4 must remain completely untouched
      const survivedQ4 = result.kit.questions.find((q) => q.id === 'q4');
      expect(survivedQ4).toBeDefined();
      expect(survivedQ4?.category).toBe('behavioural');

      // New technical questions must have IDs starting at or above nextQuestionIndex (10)
      const newQuestions = technicalQuestions.filter((q) => q.id !== 'q2' && q.id !== 'q3');
      for (const nq of newQuestions) {
        const num = parseInt(nq.id.replace('q', ''), 10);
        expect(num).toBeGreaterThanOrEqual(10);
      }

      // Schedule and coverage recomputed
      expect(result.kit.schedule.days.length).toBe(3);
      expect(result.kit.coverage).toBeDefined();
    });
  });

  describe('regenerateCompanyBrief', () => {
    it('throws CONFIRMATION_REQUIRED when company_brief._edited is true and force is false', async () => {
      const kit = createMockKit();
      kit.company_brief._edited = true;

      await expect(
        regenerateCompanyBrief(kit, { mock: true, force: false })
      ).rejects.toThrow(TaroError);

      try {
        await regenerateCompanyBrief(kit, { mock: true, force: false });
      } catch (err) {
        expect((err as TaroError).code).toBe(ErrorCode.CONFIRMATION_REQUIRED);
      }
    });

    it('successfully overwrites edited brief when force: true is passed and resets _edited to false', async () => {
      const kit = createMockKit();
      kit.company_brief._edited = true;
      kit.company_brief.summary = 'User customized summary.';

      const result = await regenerateCompanyBrief(kit, { mock: true, force: true });
      expect(result.kit.company_brief._edited).toBe(false);
      expect(result.kit.company_brief.summary).toBeDefined();
    });

    it('regenerates without force if brief was never edited', async () => {
      const kit = createMockKit();
      kit.company_brief._edited = false;

      const result = await regenerateCompanyBrief(kit, { mock: true });
      expect(result.kit.company_brief.summary).toBeDefined();
    });
  });

  describe('regenerateFlashcards', () => {
    it('preserves hand-crafted flashcards and refreshes unprotected flashcards', async () => {
      const kit = createMockKit();

      const result = await regenerateFlashcards(kit, {
        mock: true,
        nextFlashcardIndex: 5,
      });

      // f2 (_manual: true) must survive
      const survivedF2 = result.kit.flashcards.find((f) => f.id === 'f2');
      expect(survivedF2).toBeDefined();
      expect(survivedF2?._manual).toBe(true);

      // f1 (unprotected) was replaced
      const survivedF1 = result.kit.flashcards.find((f) => f.id === 'f1');
      expect(survivedF1).toBeUndefined();

      // New flashcards must have ID >= 5
      const newCards = result.kit.flashcards.filter((f) => f.id !== 'f2');
      for (const nc of newCards) {
        const num = parseInt(nc.id.replace('f', ''), 10);
        expect(num).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('cleanKitForExport', () => {
    it('strips _edited and _manual metadata from exported JSON', () => {
      const kit = createMockKit();
      kit.company_brief._edited = true;

      const clean = cleanKitForExport(kit);
      expect(clean.company_brief._edited).toBeUndefined();
      expect(clean.questions[1]._edited).toBeUndefined();
      expect(clean.questions[2]._manual).toBeUndefined();
      expect(clean.flashcards[1]._manual).toBeUndefined();
      // Ensure content is preserved
      expect(clean.questions[1].prompt).toBe(kit.questions[1].prompt);
    });
  });
});

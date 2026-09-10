/**
 * Domain 3: Step 3 — Targeted Category Question Generator
 * Generates interview questions mapped 1:1 to extracted requirements via category-isolated calls.
 * Re-entrant and directly reusable by Domain 4.2 Second Pass.
 */
import {
  Requirement,
  CompanyBrief,
  Question,
  QuestionSchema,
  QuestionCategory,
  genQIds,
} from '@taro/shared';
import { getDefaultLlmClient } from '../llm/client';
import { parseAndValidateJson } from '../llm/json-parser';
import { Step3QuestionsOptions, Step3QuestionsResult } from './types';
import { PROMPT_INJECTION_INSTRUCTION } from '../llm/prompt-guard';
import { z } from 'zod';

const SYSTEM_DESIGN_TRACK_REGEX =
  /\b(backend|infra|infrastructure|platform|distributed|systems|cloud|data engineer|sre|devops|architect)\b/i;

const DISTRIBUTED_SKILL_REGEX =
  /\b(database|sql|nosql|cache|redis|kafka|queue|scale|microservice|concurrency|throughput|consensus|event)\b/i;

const RawQuestionsArraySchema = z.object({
  questions: z.array(
    z.object({
      requirement_ids: z.array(z.string()).min(1),
      prompt: z.string().min(1),
      answer_outline: z.string().min(1),
      difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    })
  ),
});

function evaluateSystemDesignTrigger(
  requirements: Requirement[],
  options: Step3QuestionsOptions
): boolean {
  // 1. Check if D2 crawler discovered explicit system design discussion
  const dNotes = options.researchResult?.discussionNotes || '';
  if (/system\s*design|architecture\s*round|scalability\s*round/i.test(dNotes)) {
    return true;
  }

  // 2. Check seniority + title track regex
  const seniority = (options.roleSeniority || '').toLowerCase();
  const isSenior = /senior|lead|staff|principal|head/i.test(seniority);
  const title = options.roleTitle || '';

  if (isSenior && SYSTEM_DESIGN_TRACK_REGEX.test(title)) {
    return true;
  }

  // 3. Ambiguous full-stack role: check if 2+ requirements are distributed/systems related
  if (/full\s*-?\s*stack/i.test(title)) {
    const systemsReqsCount = requirements.filter((r) => DISTRIBUTED_SKILL_REGEX.test(r.text)).length;
    if (systemsReqsCount >= 2) return true;
  }

  return false;
}

function buildCategoryPrompt(
  category: QuestionCategory,
  targetReqs: Requirement[],
  brief: CompanyBrief
): { systemPrompt: string; userPrompt: string } {
  const reqList = targetReqs.map((r) => `[ID: ${r.id}] (${r.priority.toUpperCase()}) ${r.text}`).join('\n');

  let specializedInstructions = '';
  if (category === 'technical') {
    specializedInstructions = `Focus on practical coding scenarios, edge cases, distributed concurrency, debugging, and framework trade-offs.
Provide a thorough 5-point evaluation answer outline with expected technical depth, trade-offs, and code concepts.`;
  } else if (category === 'behavioural') {
    specializedInstructions = `Focus on collaboration, leadership, conflict resolution, mentoring, and technical retrospectives.
Instruct the candidate on how to structure their response using the STAR method (Situation, Task, Action, Result).`;
  } else if (category === 'system-design') {
    specializedInstructions = `Focus on scalability, data partitioning, capacity estimation, caching strategies, eventual consistency, and fault tolerance.
Provide an architectural answer outline detailing component breakdown, bottlenecks, and failure modes.`;
  } else if (category === 'company-fit') {
    specializedInstructions = `Focus on domain knowledge, company mission alignment, working with customers, and operational culture.
Provide guidance grounded in the company's stated business and technical model.`;
  }

  const systemPrompt = `You are an expert technical interviewer creating targeted questions for an interview prep kit.
${PROMPT_INJECTION_INSTRUCTION}

CATEGORY: ${category.toUpperCase()}
${specializedInstructions}

COMPANY CONTEXT:
Summary: ${brief.summary}
What They Do: ${brief.what_they_do}

CRITICAL RULES:
1. Generate at least 1 question for EVERY requirement listed below.
2. In the "requirement_ids" array, you MUST cite the exact ID(s) (e.g. "r1", "r2") from the provided list.
3. Difficulty MUST be integer 1, 2, or 3 (1=Foundational, 2=Core/Standard, 3=Advanced/Deep).
4. Respond ONLY with valid JSON matching:
{
  "questions": [
    {
      "requirement_ids": ["r1"],
      "prompt": "string",
      "answer_outline": "string",
      "difficulty": 1|2|3
    }
  ]
}`;

  const userPrompt = `Generate ${category} interview questions for the following requirements:\n${reqList}\n\nReturn JSON.`;

  return { systemPrompt, userPrompt };
}

export async function generateQuestionsForRequirements(
  targetRequirements: Requirement[],
  brief: CompanyBrief,
  options: Step3QuestionsOptions = {}
): Promise<Step3QuestionsResult> {
  const degradations: string[] = [...(options.degradations || [])];
  const client = options.client || getDefaultLlmClient({ mock: options.mock });
  let nextQIndex = options.nextQuestionIndex ?? 1;

  if (targetRequirements.length === 0) {
    return { questions: [], nextQuestionIndex: nextQIndex, degradations };
  }

  // Partition requirements by category
  const technicalReqs = targetRequirements.filter((r) => r.kind === 'technical');
  const behaviouralReqs = targetRequirements.filter((r) => r.kind === 'behavioural');
  const domainReqs = targetRequirements.filter((r) => r.kind === 'domain');

  // Evaluate Conditional Firing Triggers
  const fireTechnical = technicalReqs.length > 0;
  const fireBehavioural = behaviouralReqs.length > 0;
  const fireSystemDesign = technicalReqs.length > 0 && evaluateSystemDesignTrigger(targetRequirements, options);
  const fireCompanyFit =
    domainReqs.length > 0 || (options.researchResult && options.researchResult.pages.length > 0);

  const activeCategories: { category: QuestionCategory; reqs: Requirement[] }[] = [];

  if (fireTechnical) {
    activeCategories.push({ category: 'technical', reqs: technicalReqs });
  }
  if (fireBehavioural) {
    activeCategories.push({ category: 'behavioural', reqs: behaviouralReqs });
  }
  if (fireSystemDesign) {
    activeCategories.push({ category: 'system-design', reqs: technicalReqs });
  }
  if (fireCompanyFit) {
    activeCategories.push({ category: 'company-fit', reqs: domainReqs.length > 0 ? domainReqs : technicalReqs.slice(0, 2) });
  }

  const allGeneratedQuestions: Question[] = [];
  const validIdSet = new Set(targetRequirements.map((r) => r.id));

  for (const { category, reqs } of activeCategories) {
    if (options.onProgress) {
      options.onProgress({
        step: 'questions',
        percent: 45,
        message: `Generating ${category} interview questions and rubrics...`,
      });
    }

    try {
      const { systemPrompt, userPrompt } = buildCategoryPrompt(category, reqs, brief);
      const response = await client.complete(userPrompt, {
        systemPrompt,
        jsonMode: true,
        temperature: 0.2,
      });

      const parsed = parseAndValidateJson(response.content, RawQuestionsArraySchema, `Step 3 (${category})`);

      for (const q of parsed.questions) {
        // Referential Integrity Sanitization (Anti-False-Coverage Guarantee)
        const sanitizedIds = q.requirement_ids.filter((id) => validIdSet.has(id));

        if (sanitizedIds.length === 0) {
          // Drop orphan question outright to prevent false coverage
          degradations.push(`Dropped orphan ${category} question lacking valid requirement mapping`);
          continue;
        }

        const questionId = genQIds(1, nextQIndex - 1)[0];
        nextQIndex++;

        const question: Question = {
          id: questionId,
          requirement_ids: sanitizedIds,
          category,
          prompt: q.prompt.trim(),
          answer_outline: q.answer_outline.trim(),
          difficulty: (q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3 ? q.difficulty : 2),
        };

        QuestionSchema.parse(question);
        allGeneratedQuestions.push(question);
      }
    } catch (err) {
      // Category Failure Isolation (Invariant 6): preserve other categories, record degradation
      const msg = `Failed to generate ${category} questions: ${(err as Error).message}`;
      console.warn(`[Pipeline] ${msg}`);
      degradations.push(msg);
    }
  }

  return {
    questions: allGeneratedQuestions,
    nextQuestionIndex: nextQIndex,
    degradations,
  };
}

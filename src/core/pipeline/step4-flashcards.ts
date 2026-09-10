/**
 * Domain 3: Step 4 — Flashcard Deck Generator
 * Synthesizes quick-revision flashcards mapped to requirement IDs with concise bulleted backs.
 */
import {
  Requirement,
  Question,
  Flashcard,
  FlashcardSchema,
  genFIds,
} from '@taro/shared';
import { getDefaultLlmClient } from '../llm/client';
import { parseAndValidateJson } from '../llm/json-parser';
import { PipelineOptions, Step4FlashcardsOptions, Step4FlashcardsResult } from './types';
import { PROMPT_INJECTION_INSTRUCTION } from '../llm/prompt-guard';
import { z } from 'zod';

const RawFlashcardsArraySchema = z.object({
  flashcards: z.array(
    z.object({
      requirement_ids: z.array(z.string()).min(1),
      front: z.string().min(1),
      back: z.string().min(1),
    })
  ),
});

const STEP4_SYSTEM_PROMPT = `You are an expert technical study coach building rapid-revision flashcards for an interview prep kit.
${PROMPT_INJECTION_INSTRUCTION}

Your task:
Generate concise, high-impact revision flashcards based on the provided job requirements and question bank.

CRITICAL RULES:
1. "front": A clear, direct technical question or core conceptual prompt.
2. "back": A crisp, bulleted answer outline (2 to 4 bullet points, strictly under 60 words total). NEVER write full essays or long paragraphs.
3. "requirement_ids": Must cite at least one valid requirement ID (e.g. "r1") from the provided list.
4. Respond ONLY with valid JSON matching:
{
  "flashcards": [
    {
      "requirement_ids": ["r1"],
      "front": "string",
      "back": "• Point 1\\n• Point 2"
    }
  ]
}`;

export async function generateFlashcards(
  requirements: Requirement[],
  questions: Question[],
  options: Step4FlashcardsOptions = {}
): Promise<Step4FlashcardsResult> {
  if (options.onProgress) {
    options.onProgress({
      step: 'flashcards',
      percent: 75,
      message: 'Synthesizing rapid-revision flashcard deck...',
    });
  }

  let nextFIndex = options.nextFlashcardIndex ?? 1;

  if (requirements.length === 0) {
    return { flashcards: [], nextFlashcardIndex: nextFIndex };
  }

  const client = options.client || getDefaultLlmClient({ mock: options.mock });

  const reqSummary = requirements.map((r) => `[${r.id}] ${r.text}`).join('\n');
  const qSummary = questions.slice(0, 10).map((q) => `Q: ${q.prompt} (Maps to: ${q.requirement_ids.join(',')})`).join('\n');

  const prompt = `Requirements:\n${reqSummary}\n\nKey Sample Questions:\n${qSummary}\n\nGenerate revision flashcards. Return JSON.`;

  const response = await client.complete(prompt, {
    systemPrompt: STEP4_SYSTEM_PROMPT,
    jsonMode: true,
    temperature: 0.2,
  });

  const parsed = parseAndValidateJson(response.content, RawFlashcardsArraySchema, 'Step 4 (Flashcards)');

  const validIdSet = new Set(requirements.map((r) => r.id));
  const flashcards: Flashcard[] = [];

  for (const f of parsed.flashcards) {
    const sanitizedIds = f.requirement_ids.filter((id) => validIdSet.has(id));
    if (sanitizedIds.length === 0) continue;

    const flashcardId = genFIds(1, nextFIndex - 1)[0];
    nextFIndex++;

    const card: Flashcard = {
      id: flashcardId,
      front: f.front.trim(),
      back: f.back.trim(),
      requirement_ids: sanitizedIds,
    };

    FlashcardSchema.parse(card);
    flashcards.push(card);
  }

  return {
    flashcards,
    nextFlashcardIndex: nextFIndex,
  };
}

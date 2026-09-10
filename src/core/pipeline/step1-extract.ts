/**
 * Domain 3: Step 1 — Job Description Requirement Extractor
 * Ingests candidate JD, parses role metadata, assigns monotonic IDs (r1..rn),
 * and enforces strict priority classification to prevent inflation.
 */
import { Role, RoleSchema, Requirement, ErrorCode, TaroError, genReqIds } from '@taro/shared';
import { getDefaultLlmClient } from '../llm/client';
import { wrapUntrustedJd, PROMPT_INJECTION_INSTRUCTION } from '../llm/prompt-guard';
import { parseAndValidateJson } from '../llm/json-parser';
import { PipelineOptions, Step1ExtractResult } from './types';
import { z } from 'zod';

const RawExtractedSchema = z.object({
  title: z.string().default('Software Engineer'),
  seniority: z.string().default('Mid-Level'),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(
    z.object({
      text: z.string().min(1),
      kind: z.enum(['technical', 'behavioural', 'domain']),
      priority: z.enum(['must', 'nice']),
    })
  ).min(1, 'At least one requirement must be extracted from the job description'),
});

const STEP1_SYSTEM_PROMPT = `You are a precision Job Description analyzer for an interview preparation kit.
${PROMPT_INJECTION_INSTRUCTION}

Your task:
1. Extract the exact job title and seniority level (e.g. "Junior", "Mid-Level", "Senior", "Lead", "Staff", "Principal").
2. Extract the core key responsibilities as discrete strings.
3. Extract each qualification/skill into a discrete requirement item with "text", "kind" ('technical' | 'behavioural' | 'domain'), and "priority" ('must' | 'nice').

CRITICAL RULES:
- STRICT PRIORITY CLASSIFICATION (Anti-Inflation):
  * "must": Mark as "must" ONLY if the JD explicitly uses necessity phrases ("required", "must have", "minimum X years", "essential", "you will need") or places it under a dedicated "Requirements" section.
  * "nice": Mark as "nice" if the JD uses preference phrases ("preferred", "nice to have", "bonus points", "plus", "ideally") or general familiarity desires.
- ANTI-HALLUCINATION ON THIN INPUTS:
  * Extract ONLY skills, tools, and traits explicitly stated in the text.
  * If the job description is only 1 or 2 lines, extract ONLY the 1 or 2 stated requirements. DO NOT invent unmentioned technologies or traits.
- Respond ONLY with a valid JSON object matching:
{
  "title": "string",
  "seniority": "string",
  "responsibilities": ["string"],
  "requirements": [
    { "text": "string", "kind": "technical|behavioural|domain", "priority": "must|nice" }
  ]
}`;

export async function extractRequirements(
  jdText: string,
  options: PipelineOptions = {}
): Promise<Step1ExtractResult> {
  if (!jdText || typeof jdText !== 'string' || jdText.trim().length === 0) {
    throw new TaroError(ErrorCode.INVALID_INPUT, 'Job description text cannot be empty');
  }

  const trimmed = jdText.trim();
  const isThinJd = trimmed.length < 200;

  if (options.onProgress) {
    options.onProgress({
      step: 'extract',
      percent: 15,
      message: 'Analyzing job description and extracting role requirements...',
    });
  }

  const client = options.client || getDefaultLlmClient({ mock: options.mock });
  const prompt = `${wrapUntrustedJd(trimmed)}\n\nExtract the structured role metadata and discrete requirements from the text above. Return JSON.`;

  const response = await client.complete(prompt, {
    systemPrompt: STEP1_SYSTEM_PROMPT,
    jsonMode: true,
    temperature: 0.1, // low temperature for precise factual extraction
  });

  const rawParsed = parseAndValidateJson(response.content, RawExtractedSchema, 'Step 1 (Extract)');

  // Assign stable, monotonic IDs (r1..rn)
  const reqIds = genReqIds(rawParsed.requirements.length, 0);
  const requirements: Requirement[] = rawParsed.requirements.map((req, index) => ({
    id: reqIds[index],
    text: req.text.trim(),
    kind: req.kind,
    priority: req.priority,
  }));

  const role: Role = {
    title: rawParsed.title.trim() || 'Software Engineer',
    seniority: rawParsed.seniority.trim() || (isThinJd ? 'Not Specified' : 'Mid-Level'),
    responsibilities: rawParsed.responsibilities.map((r) => r.trim()).filter(Boolean),
    requirements,
  };

  // Assert Appendix A schema conformance
  RoleSchema.parse(role);

  return {
    role,
    nextRequirementIndex: requirements.length + 1,
    isThinJd,
  };
}

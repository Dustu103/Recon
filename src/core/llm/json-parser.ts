/**
 * Domain 3: Multi-Stage AST JSON Parser & Repair Utility
 * Recovers from markdown code fences, unescaped characters, and trailing syntax defects.
 */
import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';
import { ErrorCode, TaroError } from '@taro/shared';

/**
 * Strips markdown code fences (```json ... ``` or ``` ... ```) and leading/trailing whitespace.
 */
export function stripMarkdownFences(content: string): string {
  if (!content) return '';
  let text = content.trim();

  // Match ```json ... ``` or ``` ... ```
  const fenceRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = fenceRegex.exec(text);
  if (match && match[1]) {
    text = match[1].trim();
  }

  // Handle cases where model prepended conversational commentary before the first '{' or '['
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');

  let startIndex = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIndex = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  if (startIndex > 0) {
    // Also find last matching brace/bracket
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const endIndex = Math.max(lastBrace, lastBracket);
    if (endIndex > startIndex) {
      text = text.substring(startIndex, endIndex + 1).trim();
    }
  }

  return text;
}

/**
 * Parses raw string into parsed JSON object, repairing AST if needed.
 * Optionally validates against a Zod schema.
 */
export function parseAndValidateJson<T>(
  raw: string,
  schema?: z.ZodSchema<T>,
  contextName = 'LLM Output'
): T {
  if (!raw || typeof raw !== 'string') {
    throw new TaroError(ErrorCode.LLM_INVALID_JSON, `${contextName}: Received empty or non-string response`);
  }

  const cleaned = stripMarkdownFences(raw);

  let parsed: unknown;

  // Stage 1: Fast direct JSON.parse
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Stage 2: AST repair via jsonrepair
    try {
      const repaired = jsonrepair(cleaned);
      parsed = JSON.parse(repaired);
    } catch (repairErr) {
      throw new TaroError(
        ErrorCode.LLM_INVALID_JSON,
        `${contextName}: Failed to parse JSON even after AST repair: ${(repairErr as Error).message}`,
        { raw: cleaned.slice(0, 300) }
      );
    }
  }

  // Stage 3: Schema validation
  if (schema) {
    const validation = schema.safeParse(parsed);
    if (!validation.success) {
      const errMessages = validation.error.errors
        .map((e) => `[${e.path.join('.') || 'root'}] ${e.message}`)
        .join('; ');
      throw new TaroError(
        ErrorCode.KIT_SCHEMA_INVALID,
        `${contextName}: Schema validation failed against expected Appendix A contracts: ${errMessages}`,
        { parsed, errors: validation.error.errors }
      );
    }
    return validation.data;
  }

  // Appendix A JSON outputs are always objects or arrays, never bare primitives
  if (typeof parsed !== 'object' || parsed === null) {
    throw new TaroError(
      ErrorCode.LLM_INVALID_JSON,
      `${contextName}: Expected JSON object or array, received ${typeof parsed}: ${JSON.stringify(parsed)}`
    );
  }

  return parsed as T;
}

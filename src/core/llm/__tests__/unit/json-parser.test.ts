import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { stripMarkdownFences, parseAndValidateJson } from '../../json-parser';
import { ErrorCode, TaroError } from '@taro/shared';

describe('AST JSON Parser & Repair Utility', () => {
  it('strips markdown code fences from JSON output', () => {
    const raw = '```json\n{"name": "test"}\n```';
    expect(stripMarkdownFences(raw)).toBe('{"name": "test"}');

    const rawNoLang = '```\n{"count": 42}\n```';
    expect(stripMarkdownFences(rawNoLang)).toBe('{"count": 42}');
  });

  it('strips conversational preambles preceding JSON', () => {
    const raw = 'Here is the extracted role JSON you requested:\n\n{"role": "Engineer"}';
    expect(stripMarkdownFences(raw)).toBe('{"role": "Engineer"}');
  });

  it('parses valid JSON without error', () => {
    const res = parseAndValidateJson<{ a: number }>('{"a": 123}');
    expect(res).toEqual({ a: 123 });
  });

  it('repairs broken JSON (trailing commas, unescaped quotes) via jsonrepair', () => {
    const broken = '{"items": [1, 2, 3, ], "name": "demo"}';
    const res = parseAndValidateJson<{ items: number[]; name: string }>(broken);
    expect(res.items).toEqual([1, 2, 3]);
    expect(res.name).toBe('demo');
  });

  it('validates against Zod schema and returns typed object', () => {
    const schema = z.object({
      id: z.string(),
      count: z.number().int().min(1),
    });

    const valid = '{"id": "r1", "count": 5}';
    const res = parseAndValidateJson(valid, schema);
    expect(res.id).toBe('r1');
    expect(res.count).toBe(5);

    const invalid = '{"id": "r1", "count": -1}';
    expect(() => parseAndValidateJson(invalid, schema)).toThrow(TaroError);
    try {
      parseAndValidateJson(invalid, schema);
    } catch (err) {
      expect((err as TaroError).code).toBe(ErrorCode.KIT_SCHEMA_INVALID);
    }
  });

  it('throws LLM_INVALID_JSON on unrecoverable syntax', () => {
    expect(() => parseAndValidateJson('not json at all')).toThrow(TaroError);
    try {
      parseAndValidateJson('not json at all');
    } catch (err) {
      expect((err as TaroError).code).toBe(ErrorCode.LLM_INVALID_JSON);
    }
  });
});

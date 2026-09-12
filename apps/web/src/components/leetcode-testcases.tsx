'use client';

import React, { useState } from 'react';
import {
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Cpu,
} from 'lucide-react';
import { InterviewFeedback } from '@taro/shared';

export interface TestCaseExample {
  id: number;
  input: string;
  output: string;
  explanation?: string;
  rawText?: string;
}

export interface ParsedQuestionDetails {
  description: string;
  examples: TestCaseExample[];
  constraints: string[];
}

/**
 * Parses raw question prompt strings into structured LeetCode-style
 * Problem Descriptions, Examples (Input/Output/Explanation), and Constraints.
 */
export function parseQuestionPrompt(prompt: string): ParsedQuestionDetails {
  if (!prompt) {
    return { description: '', examples: [], constraints: [] };
  }

  let descriptionAndExamples = prompt;
  let constraintsText = '';

  // Extract Constraints / Requirements section
  const constraintsMatch = prompt.match(
    /(?:Constraints|Task Requirements|Requirements):([\s\S]*)$/i
  );
  if (constraintsMatch && constraintsMatch.index !== undefined) {
    descriptionAndExamples = prompt.substring(0, constraintsMatch.index).trim();
    constraintsText = constraintsMatch[1].trim();
  }

  const constraints: string[] = [];
  if (constraintsText) {
    constraintsText
      .split('\n')
      .map((line) => line.replace(/^[-*•\d.]+\s*/, '').trim())
      .filter((line) => line.length > 0)
      .forEach((c) => constraints.push(c));
  }

  // Extract Examples / Test Cases
  const exampleRegex =
    /(?:Example\s*(\d+)|Test\s*Case\s*(\d+))[:\s]*([\s\S]*?)(?=(?:Example\s*\d+|Test\s*Case\s*\d+|Constraints:|Task Requirements:|$))/gi;
  const examples: TestCaseExample[] = [];

  let match: RegExpExecArray | null;
  while ((match = exampleRegex.exec(descriptionAndExamples)) !== null) {
    const num = parseInt(match[1] || match[2] || `${examples.length + 1}`, 10);
    const body = match[3].trim();

    const inputMatch = body.match(/Input:\s*([^\n]+(?:\n(?!(?:Output|Explanation):)[^\n]+)*)/i);
    const outputMatch = body.match(/Output:\s*([^\n]+(?:\n(?!Explanation:)[^\n]+)*)/i);
    const explanationMatch = body.match(/Explanation:\s*([\s\S]*)/i);

    if (inputMatch || outputMatch) {
      examples.push({
        id: num,
        input: inputMatch ? inputMatch[1].trim() : '',
        output: outputMatch ? outputMatch[1].trim() : '',
        explanation: explanationMatch ? explanationMatch[1].trim() : undefined,
        rawText: body,
      });
    } else if (body.length > 0) {
      examples.push({
        id: num,
        input: body,
        output: '',
        rawText: body,
      });
    }
  }

  // Description is whatever text precedes the first Example
  const firstExampleIndex = descriptionAndExamples.search(/(?:Example\s*\d+|Test\s*Case\s*\d+)/i);
  const description =
    firstExampleIndex !== -1
      ? descriptionAndExamples.substring(0, firstExampleIndex).trim()
      : descriptionAndExamples.trim();

  // If no explicit examples were detected in a technical question, provide intuitive default test cases
  if (examples.length === 0) {
    if (/\b(sql|postgres|database|query|table|schema)\b/i.test(prompt)) {
      examples.push({
        id: 1,
        input: 'products (id, name, price, category_id), orders (id, customer_id, total)',
        output: 'Structured query result set / validated schema DDL with indexes',
        explanation: 'Verify schema constraints, index definitions, and query execution efficiency.',
      });
    } else if (/\b(array|string|list|tree|graph|dp|two sum|substring)\b/i.test(prompt)) {
      examples.push({
        id: 1,
        input: 'Standard non-empty input scenario',
        output: 'Expected deterministic output',
        explanation: 'Evaluate base algorithmic approach and time/space complexity.',
      });
      examples.push({
        id: 2,
        input: 'Edge case (e.g., empty collection, single item, or boundary values)',
        output: 'Boundary-safe return value',
        explanation: 'Verify edge condition handling and defensive checks.',
      });
    }
  }

  return { description, examples, constraints };
}

/**
 * Interactive Test Cases Panel (LeetCode Style)
 * Displays Case 1, Case 2 with Input / Expected Output and real-time execution verdicts.
 */
export function TestCasePanel({
  prompt,
  onCopyInput,
  feedback,
}: {
  prompt: string;
  onCopyInput?: (input: string) => void;
  feedback?: InterviewFeedback | null;
}) {
  const { examples, constraints } = parseQuestionPrompt(prompt);
  const [activeCaseIndex, setActiveCaseIndex] = useState(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (examples.length === 0 && constraints.length === 0 && !feedback) {
    return null;
  }

  const activeExample = examples[activeCaseIndex] || examples[0];

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    if (onCopyInput) onCopyInput(text);
  }

  const verdict =
    feedback?.verdict ||
    (typeof feedback?.score === 'number'
      ? feedback.score >= 8
        ? 'Accepted'
        : feedback.score <= 4
        ? 'Wrong Answer'
        : 'Needs Revision'
      : undefined);

  const testCasesPassed =
    feedback?.testCasesPassed ?? (verdict === 'Accepted' ? (examples.length || 2) : verdict === 'Wrong Answer' ? 0 : 1);
  const totalTestCases = feedback?.totalTestCases ?? (examples.length || 2);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-lg">
      {/* Test Case Header & Verdict Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200">Test Cases & Validation</span>
        </div>

        {/* Case Switcher Tabs */}
        {examples.length > 0 && (
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {examples.map((ex, idx) => {
              const isPassed = feedback ? idx < testCasesPassed : null;
              return (
                <button
                  key={ex.id || idx}
                  type="button"
                  onClick={() => setActiveCaseIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeCaseIndex === idx
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Case {ex.id || idx + 1}</span>
                  {isPassed !== null && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isPassed ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* LeetCode Real-Time Execution Verdict Card */}
      {feedback && verdict && (
        <div
          className={`p-3 rounded-xl border text-xs space-y-2 transition-all duration-200 ${
            verdict === 'Accepted'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : verdict === 'Wrong Answer'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {verdict === 'Accepted' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : verdict === 'Wrong Answer' ? (
                <XCircle className="w-4 h-4 text-rose-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              <span className="font-extrabold text-sm tracking-wide">{verdict}</span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-extrabold border ${
                  verdict === 'Accepted'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : verdict === 'Wrong Answer'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {testCasesPassed} / {totalTestCases} Test Cases Passed
              </span>
              {typeof feedback.score === 'number' && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-950/60 text-slate-200 border border-slate-700/60">
                  Score: {feedback.score}/10
                </span>
              )}
            </div>
          </div>

          {/* Complexity Badges */}
          {feedback.codeAnalysis && (
            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[10px]">
              <span className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                <Zap className="w-3 h-3 text-amber-400" />
                Time: <strong className="text-white">{feedback.codeAnalysis.timeComplexity || 'N/A'}</strong>
              </span>
              <span className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                <Cpu className="w-3 h-3 text-cyan-400" />
                Space: <strong className="text-white">{feedback.codeAnalysis.spaceComplexity || 'N/A'}</strong>
              </span>
            </div>
          )}

          {/* Targeted Improvement Tips */}
          {feedback.areasForImprovement && feedback.areasForImprovement.length > 0 && (
            <div className="text-[11px] text-slate-300 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
              <span className="font-semibold text-amber-300">Test Evaluation Notes: </span>
              {feedback.areasForImprovement.join(' • ')}
            </div>
          )}
        </div>
      )}

      {/* Active Case Details */}
      {activeExample && (
        <div className="space-y-2 text-xs">
          {/* Input Box */}
          {activeExample.input && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="font-semibold text-slate-300">Input:</span>
                <button
                  type="button"
                  onClick={() => handleCopy(activeExample.input, `input-${activeCaseIndex}`)}
                  className="flex items-center gap-1 hover:text-emerald-400 transition-colors text-[10px] cursor-pointer"
                  title="Copy test input"
                >
                  {copiedKey === `input-${activeCaseIndex}` ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Input</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 bg-slate-950 border border-slate-800/90 rounded-xl font-mono text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                {activeExample.input}
              </pre>
            </div>
          )}

          {/* Output Box */}
          {activeExample.output && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="font-semibold text-slate-300">Expected Output:</span>
                <button
                  type="button"
                  onClick={() => handleCopy(activeExample.output, `output-${activeCaseIndex}`)}
                  className="flex items-center gap-1 hover:text-emerald-400 transition-colors text-[10px] cursor-pointer"
                  title="Copy expected output"
                >
                  {copiedKey === `output-${activeCaseIndex}` ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Output</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-2.5 bg-slate-950 border border-slate-800/90 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto whitespace-pre-wrap">
                {activeExample.output}
              </pre>
            </div>
          )}

          {/* Explanation */}
          {activeExample.explanation && (
            <div className="text-[11px] text-slate-400 italic pt-0.5">
              <span className="text-slate-500 font-semibold not-italic">Explanation: </span>
              {activeExample.explanation}
            </div>
          )}
        </div>
      )}

      {/* Constraints Summary */}
      {constraints.length > 0 && (
        <div className="pt-2 border-t border-slate-800/80 space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Constraints & Complexity:
          </span>
          <ul className="space-y-0.5 text-[11px] font-mono text-slate-400 list-disc list-inside">
            {constraints.map((c, i) => (
              <li key={i} className="truncate">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Rich LeetCode Problem Display Component
 * Formats question descriptions with styled Example and Constraint boxes.
 */
export function LeetCodeProblemCard({ prompt }: { prompt: string }) {
  const { description, examples, constraints } = parseQuestionPrompt(prompt);
  const [showAllExamples, setShowAllExamples] = useState(false);

  return (
    <div className="space-y-3">
      {/* Problem Description */}
      <div className="text-sm text-slate-200 font-sans leading-relaxed whitespace-pre-line">
        {description || prompt}
      </div>

      {/* LeetCode Example Callout Boxes */}
      {examples.length > 0 && (
        <div className="space-y-2.5 pt-1">
          {examples.slice(0, showAllExamples ? examples.length : 2).map((ex, i) => (
            <div
              key={ex.id || i}
              className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 text-xs font-mono space-y-1.5 shadow-inner"
            >
              <div className="font-bold text-emerald-400 flex items-center gap-1.5 text-[11px]">
                <Sparkles className="w-3 h-3" />
                Example {ex.id || i + 1}:
              </div>
              {ex.input && (
                <div>
                  <span className="text-slate-400">Input: </span>
                  <span className="text-slate-200 font-semibold">{ex.input}</span>
                </div>
              )}
              {ex.output && (
                <div>
                  <span className="text-slate-400">Output: </span>
                  <span className="text-amber-300 font-semibold">{ex.output}</span>
                </div>
              )}
              {ex.explanation && (
                <div className="text-[11px] text-slate-400 font-sans italic pt-0.5">
                  <span className="not-italic text-slate-500 font-mono">Explanation: </span>
                  {ex.explanation}
                </div>
              )}
            </div>
          ))}

          {examples.length > 2 && (
            <button
              type="button"
              onClick={() => setShowAllExamples(!showAllExamples)}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              {showAllExamples ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Show fewer examples</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Show {examples.length - 2} more example(s)</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Constraints Box */}
      {constraints.length > 0 && (
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5">
          <div className="font-bold text-slate-400 text-[11px] uppercase tracking-wider">
            Constraints:
          </div>
          <ul className="space-y-1 font-mono text-[11px] text-slate-300 list-disc list-inside">
            {constraints.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

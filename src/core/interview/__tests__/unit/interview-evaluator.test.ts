import { describe, it, expect } from 'vitest';
import { evaluateInterviewTurn, generateInterviewReport } from '../../interview-evaluator';
import { LlmClient } from '../../../llm/client';

describe('AI Interview Turn Evaluator', () => {
  it('evaluates candidate text answer and returns structured interviewer feedback', async () => {
    const mockClient = new LlmClient({ mock: true });

    const result = await evaluateInterviewTurn(
      {
        questionId: 'q1',
        questionPrompt: 'How does React reconciliation work under the hood?',
        category: 'technical',
        userMessage: 'React uses a virtual DOM and the Fiber reconciliation engine to diff components in O(n) time using element keys.',
        conversationHistory: [],
      },
      mockClient
    );

    expect(result).toBeDefined();
    expect(typeof result.interviewerReply).toBe('string');
    expect(result.interviewerReply.length).toBeGreaterThan(10);
    expect(result.feedback).toBeDefined();
    expect(typeof result.feedback.score).toBe('number');
    expect(Array.isArray(result.feedback.strengths)).toBe(true);
    expect(Array.isArray(result.feedback.areasForImprovement)).toBe(true);
  });

  it('evaluates candidate turn with submitted JavaScript code', async () => {
    const mockClient = new LlmClient({ mock: true });

    const jsCode = `function lengthOfLongestSubstring(s) {
  let map = new Map();
  let left = 0, max = 0;
  for (let right = 0; right < s.length; right++) {
    if (map.has(s[right])) {
      left = Math.max(left, map.get(s[right]) + 1);
    }
    map.set(s[right], right);
    max = Math.max(max, right - left + 1);
  }
  return max;
}`;

    const result = await evaluateInterviewTurn(
      {
        questionId: 'q_code_js',
        questionPrompt: 'Find the length of the longest substring without repeating characters.',
        category: 'technical',
        userMessage: 'Here is my sliding window solution in JavaScript maintaining character indices.',
        codeSnippet: {
          language: 'javascript',
          code: jsCode,
        },
        conversationHistory: [],
      },
      mockClient
    );

    expect(result.interviewerReply).toBeDefined();
    expect(result.feedback.codeAnalysis).toBeDefined();
    expect(result.feedback.codeAnalysis?.timeComplexity).toBeDefined();
  });

  it('evaluates candidate turn with submitted C++ code', async () => {
    const mockClient = new LlmClient({ mock: true });

    const cppCode = `#include <iostream>
#include <vector>
#include <unordered_map>
#include <string>

using namespace std;

int lengthOfLongestSubstring(string s) {
    unordered_map<char, int> charMap;
    int left = 0, maxLength = 0;
    for (int right = 0; right < s.length(); right++) {
        if (charMap.count(s[right])) {
            left = max(left, charMap[s[right]] + 1);
        }
        charMap[s[right]] = right;
        maxLength = max(maxLength, right - left + 1);
    }
    return maxLength;
}`;

    const result = await evaluateInterviewTurn(
      {
        questionId: 'q_code_cpp',
        questionPrompt: 'Find the length of the longest substring without repeating characters in C++.',
        category: 'technical',
        userMessage: 'I implemented this with C++ unordered_map and two pointers.',
        codeSnippet: {
          language: 'cpp',
          code: cppCode,
        },
        conversationHistory: [],
      },
      mockClient
    );

    expect(result.interviewerReply).toBeDefined();
    expect(result.feedback.codeAnalysis).toBeDefined();
  });

  it('supports multi-turn conversation context', async () => {
    const mockClient = new LlmClient({ mock: true });

    const result = await evaluateInterviewTurn(
      {
        questionId: 'q1',
        questionPrompt: 'Describe a conflict with a peer engineer.',
        category: 'behavioural',
        userMessage: 'I listened actively, identified common technical goals, and proposed an A/B testing compromise.',
        conversationHistory: [
          {
            role: 'interviewer',
            content: 'Can you describe a situation where you had a fundamental disagreement with another engineer?',
          },
          {
            role: 'candidate',
            content: 'We disagreed on whether to use GraphQL or REST for a new public endpoint.',
          },
          {
            role: 'interviewer',
            content: 'How did you break the deadlock?',
          },
        ],
      },
      mockClient
    );

    expect(result.interviewerReply).toBeDefined();
    expect(result.feedback.strengths.length).toBeGreaterThan(0);
  });

  it('generates session report analyzing timer duration and repeating errors', async () => {
    const mockClient = new LlmClient({ mock: true });

    const report = await generateInterviewReport(
      {
        questionId: 'q_report_test',
        questionPrompt: 'Implement LRU Cache with O(1) get and put operations.',
        category: 'technical',
        durationSeconds: 745, // ~12m 25s
        conversationHistory: [
          {
            role: 'interviewer',
            content: 'How would you design an LRU cache?',
          },
          {
            role: 'candidate',
            content: 'I would use a hash map and a doubly linked list.',
          },
          {
            role: 'interviewer',
            content: 'What happens when capacity is exceeded?',
          },
          {
            role: 'candidate',
            content: 'Remove the tail node from the doubly linked list and delete its key from the hash map.',
          },
        ],
        codeSnippet: {
          language: 'javascript',
          code: 'class LRUCache { constructor(capacity) { this.capacity = capacity; this.map = new Map(); } }',
        },
      },
      mockClient
    );

    expect(report).toBeDefined();
    expect(typeof report.overallScore).toBe('number');
    expect(report.durationFormatted).toBe('12m 25s');
    expect(report.pacingEvaluation).toBeDefined();
    expect(Array.isArray(report.repeatingErrors)).toBe(true);
    expect(Array.isArray(report.strengths)).toBe(true);
    expect(Array.isArray(report.actionablePracticePlan)).toBe(true);
    expect(report.codeReview).toBeDefined();
    expect(report.codeReview?.language).toBe('javascript');
  });

  it('evaluates candidate turn with submitted SQL schema and query', async () => {
    const mockClient = new LlmClient({ mock: true });

    const sqlCode = `CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price NUMERIC(10, 2) NOT NULL
);

SELECT category, COUNT(*) AS count, AVG(price) AS avg_price
FROM products
GROUP BY category
ORDER BY count DESC;`;

    const result = await evaluateInterviewTurn(
      {
        questionId: 'q_code_sql',
        questionPrompt: 'Design a schema for product catalog and write a category grouping query.',
        category: 'technical',
        userMessage: 'Here is my PostgreSQL schema DDL and aggregated query.',
        codeSnippet: {
          language: 'sql',
          code: sqlCode,
        },
        conversationHistory: [],
      },
      mockClient
    );

    expect(result.interviewerReply).toBeDefined();
    expect(result.feedback).toBeDefined();
    expect(typeof result.feedback.score).toBe('number');
  });

  it('evaluates candidate turn with submitted Python code', async () => {
    const mockClient = new LlmClient({ mock: true });

    const pyCode = `class Solution:
    def lengthOfLongestSubstring(self, s: str) -> int:
        char_map = {}
        left = max_len = 0
        for right, char in enumerate(s):
            if char in char_map and char_map[char] >= left:
                left = char_map[char] + 1
            char_map[char] = right
            max_len = max(max_len, right - left + 1)
        return max_len`;

    const result = await evaluateInterviewTurn(
      {
        questionId: 'q_code_py',
        questionPrompt: 'Find the length of the longest substring without repeating characters in Python.',
        category: 'technical',
        userMessage: 'Implemented sliding window with Python dictionary.',
        codeSnippet: {
          language: 'python',
          code: pyCode,
        },
        conversationHistory: [],
      },
      mockClient
    );

    expect(result.interviewerReply).toBeDefined();
    expect(result.feedback).toBeDefined();
    expect(typeof result.feedback.score).toBe('number');
  });
});

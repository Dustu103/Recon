/**
 * Domain 3: Deterministic Mock LLM Provider
 * Generates realistic, schema-valid JSON for hermetic offline testing and CLI evaluate mode.
 * Strictly isolated from live production failover.
 */
import { LlmProvider, LlmRequestOptions, LlmResponse } from '../types';

export class MockLlmProvider implements LlmProvider {
  public readonly name = 'mock' as const;

  public async complete(prompt: string, options: LlmRequestOptions = {}): Promise<LlmResponse> {
    const p = prompt.toLowerCase();
    const sys = (options.systemPrompt || '').toLowerCase();

    let content = '{}';

    // 1. Flashcards check (Check first to avoid prompt with 'sample questions' collision)
    if (sys.includes('flashcard') || p.includes('flashcard')) {
      // Find IDs mentioned in prompt (e.g. [r1], [r4])
      const idMatches = prompt.match(/\[([rR]\d+)\]/g) || ['[r1]'];
      const targetIds = idMatches.map((m) => m.replace(/[\[\]]/g, ''));

      content = JSON.stringify({
        flashcards: targetIds.map((reqId, idx) => ({
          id: `f${idx + 1}`,
          front: `What are the core operational principles of requirement ${reqId}?`,
          back: `• Core execution pattern for ${reqId}.\n• Expected latency and throughput trade-offs.\n• Fault tolerance and rollback strategy.`,
          requirement_ids: [reqId],
        })),
      });
    }
    // 2. Company Brief check
    else if (sys.includes('brief') || p.includes('company brief') || p.includes('company_brief')) {
      if (p.includes('no pages') || p.includes('pages: []') || p.includes('unreachable') || p.includes('could not be retrieved')) {
        content = JSON.stringify({
          summary: 'Company website could not be retrieved from public sources.',
          what_they_do: 'Unknown from public web crawl.',
          sources: [],
        });
      } else {
        content = JSON.stringify({
          summary: 'A leading technology platform providing scalable cloud services and infrastructure.',
          what_they_do: 'Enterprise software, developer tooling, and distributed cloud computing infrastructure.',
          sources: ['https://example.com', 'https://example.com/careers'],
        });
      }
    }
    // 3. Questions check
    else if (sys.includes('question') || p.includes('questions')) {
      // Extract target requirement IDs from prompt (e.g. [ID: r1], [ID: r4])
      const idMatches = prompt.match(/\[ID:\s*([rR]\d+)\]/gi) || [];
      const targetIds = idMatches.map((m) => m.replace(/\[ID:\s*|\]/gi, '').trim());
      const activeIds = targetIds.length > 0 ? targetIds : ['r1'];

      if (sys.includes('category: behavioural') || p.includes('behavioural')) {
        content = JSON.stringify({
          questions: activeIds.map((reqId, idx) => ({
            id: `q${idx + 1}`,
            requirement_ids: [reqId],
            category: 'behavioural',
            prompt: `Describe a scenario where you demonstrated ownership and collaboration regarding ${reqId}.`,
            answer_outline: 'Apply the STAR method. Clarify initial ambiguity, action taken with peers, and quantifiable impact.',
            difficulty: 2,
          })),
        });
      } else if (sys.includes('category: system-design') || p.includes('system-design')) {
        content = JSON.stringify({
          questions: activeIds.map((reqId, idx) => ({
            id: `q${idx + 1}`,
            requirement_ids: [reqId],
            category: 'system-design',
            prompt: `Architect a scalable, fault-tolerant distributed system satisfying requirement ${reqId}.`,
            answer_outline: 'Address capacity estimations, partitioned storage, caching invalidation, and data consistency under partition.',
            difficulty: 3,
          })),
        });
      } else {
        // Technical or Company Fit default
        content = JSON.stringify({
          questions: activeIds.map((reqId, idx) => ({
            id: `q${idx + 1}`,
            requirement_ids: [reqId],
            category: sys.includes('company-fit') ? 'company-fit' : 'technical',
            prompt: `How would you implement and debug edge cases for requirement ${reqId}?`,
            answer_outline: 'Explain runtime execution, memory footprint, asynchronous handling, and unit test strategies.',
            difficulty: 2,
          })),
        });
      }
    }
    // 4. Extraction check
    else {
      content = JSON.stringify({
        title: 'Senior Software Engineer',
        seniority: 'Senior',
        responsibilities: [
          'Design and maintain scalable backend microservices in TypeScript and Go.',
          'Lead technical design reviews and mentor junior engineers.',
          'Optimize database query execution and caching layers.',
        ],
        requirements: [
          {
            id: 'r1',
            text: '5+ years experience building backend services with Node.js and TypeScript',
            kind: 'technical',
            priority: 'must',
          },
          {
            id: 'r2',
            text: 'Deep knowledge of distributed systems, concurrency, and event-driven architectures',
            kind: 'technical',
            priority: 'must',
          },
          {
            id: 'r3',
            text: 'Experience with PostgreSQL or MongoDB database modeling and performance optimization',
            kind: 'technical',
            priority: 'must',
          },
          {
            id: 'r4',
            text: 'Demonstrated experience mentoring junior engineers and leading architectural initiatives',
            kind: 'behavioural',
            priority: 'must',
          },
          {
            id: 'r5',
            text: 'Experience with Kubernetes, Docker, and CI/CD pipelines',
            kind: 'technical',
            priority: 'nice',
          },
        ],
      });
    }

    return {
      content,
      promptTokens: 150,
      completionTokens: 200,
      totalTokens: 350,
      model: 'mock-deterministic',
      provider: 'mock',
    };
  }
}

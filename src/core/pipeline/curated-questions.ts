/**
 * Domain 3: Curated Question Pool & Dynamic Requirement Binder
 * Houses vetted, gold-standard interview question templates across core competencies.
 * Dynamically binds requirement IDs (r1..rn) at runtime to reduce LLM latency and costs
 * while strictly guaranteeing referential integrity and Appendix A compliance.
 */
import { Requirement, Question, genQIds } from '@taro/shared';

export interface CuratedQuestionTemplate {
  category: 'technical' | 'behavioural' | 'system-design' | 'company-fit';
  tags: string[];
  prompt: string;
  answer_outline: string;
  evaluation_criteria: string[];
  difficulty: 1 | 2 | 3;
}

/**
 * 25+ High-Yield Curated Question Templates covering foundational engineering
 * and behavioral leadership competencies.
 */
export const CURATED_QUESTION_TEMPLATES: CuratedQuestionTemplate[] = [
  // ── Data Structures & Algorithms (LeetCode Style) ─────────────────────────
  {
    category: 'technical',
    tags: ['dsa', 'data structures', 'algorithms', 'arrays', 'hash', 'strings', 'two pointer', 'sliding window'],
    prompt: `Given a string s, find the length of the longest substring without repeating characters.

Example 1:
Input: s = "abcabcbb"
Output: 3
Explanation: The answer is "abc", with the length of 3.

Example 2:
Input: s = "bbbbb"
Output: 1
Explanation: The answer is "b", with the length of 1.

Example 3:
Input: s = "pwwkew"
Output: 3
Explanation: The answer is "wke", with the length of 3. Notice that "pwke" is a subsequence and not a substring.

Constraints:
- 0 <= s.length <= 5 * 10^4
- s consists of English letters, digits, symbols and spaces.
- Target: O(n) time complexity and O(min(m, n)) space complexity.`,
    answer_outline:
      'Use a sliding window with a HashMap/Set storing each character and its last seen index. Expand the right pointer; when a duplicate is encountered inside the current window, advance the left pointer past the previous occurrence. Track and return the maximum window length.',
    evaluation_criteria: [
      'Correctly identifies sliding window technique with dynamic left/right pointers',
      'Explains O(n) time complexity and O(min(m,n)) character set space bounds',
      'Handles edge cases (empty strings, all identical characters, single character)',
    ],
    difficulty: 2,
  },
  {
    category: 'technical',
    tags: ['dsa', 'data structures', 'algorithms', 'arrays', 'two sum', 'hashmap'],
    prompt: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.

Example 1:
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].

Example 2:
Input: nums = [3,2,4], target = 6
Output: [1,2]

Example 3:
Input: nums = [3,3], target = 6
Output: [0,1]

Constraints:
- 2 <= nums.length <= 10^4
- -10^9 <= nums[i] <= 10^9
- -10^9 <= target <= 10^9
- Only one valid answer exists.
- Target: O(n) time complexity using a single-pass hash map.`,
    answer_outline:
      'Iterate through nums while maintaining a hash map of value to index. For each element, compute complement = target - nums[i]. If complement exists in map, return [map.get(complement), i]. Otherwise insert nums[i] into map.',
    evaluation_criteria: [
      'Solves in O(n) time using single-pass hash map rather than O(n^2) brute force',
      'Accurately handles duplicate values and negative integers',
      'Analyzes O(n) auxiliary space complexity',
    ],
    difficulty: 1,
  },
  {
    category: 'technical',
    tags: ['dsa', 'data structures', 'algorithms', 'trees', 'graphs', 'bfs', 'dfs'],
    prompt: `Given the root of a binary tree, return the level order traversal of its nodes' values (i.e., from left to right, level by level).

Example 1:
Input: root = [3,9,20,null,null,15,7]
Output: [[3],[9,20],[15,7]]

Example 2:
Input: root = [1]
Output: [[1]]

Example 3:
Input: root = []
Output: []

Constraints:
- The number of nodes in the tree is in the range [0, 2000].
- -1000 <= Node.val <= 1000
- Compare BFS (Queue-based) vs DFS (Recursive with level depth tracking) approaches.`,
    answer_outline:
      'BFS explores level-by-level using a queue. For each level, record queue size, dequeue all nodes at that level, collect their values, and enqueue non-null children. Alternatively, DFS passes depth index and appends to corresponding sub-array.',
    evaluation_criteria: [
      'Contrasts queue-based iterative BFS vs recursive DFS state management',
      'Explains O(N) time and O(W) max tree width space complexity',
      'Handles empty root and skewed tree edge cases cleanly',
    ],
    difficulty: 2,
  },

  // ── Distributed Systems & Microservices ───────────────────────────────────
  {
    category: 'technical',
    tags: ['microservices', 'distributed systems', 'architecture', 'scalability', 'system design', 'high-throughput'],
    prompt: 'How do you design an idempotent API endpoint for payment processing or state mutations in a distributed system?',
    answer_outline:
      'Require an Idempotency-Key in the HTTP header generated by the client (e.g. UUID v4). Before processing, acquire a distributed lock in Redis or insert into an idempotency table with status PENDING. If already processed, return the cached result payload without re-executing business logic.',
    evaluation_criteria: [
      'Explains Idempotency-Key header mechanism and unique UUID tracking',
      'Discusses concurrency race condition handling (atomic set-if-not-exists or DB unique index)',
      'Distinguishes in-flight deduplication from completed response caching',
    ],
    difficulty: 3,
  },
  {
    category: 'technical',
    tags: ['distributed systems', 'consistency', 'cap', 'partition', 'database', 'eventual consistency'],
    prompt: 'Explain the CAP theorem and the trade-offs between CP and AP distributed data stores during a network partition.',
    answer_outline:
      'Under a network partition (P), a distributed system must choose between Consistency (all nodes return the latest write, sacrificing availability by returning errors) or Availability (every request receives a response, but data may be stale).',
    evaluation_criteria: [
      'Correctly emphasizes that partitions (P) are unavoidable in distributed networks',
      'Explains CP behavior (e.g. Raft consensus rejecting writes when quorum is lost)',
      'Explains AP behavior (e.g. DynamoDB/Cassandra accepting writes with eventual convergence)',
    ],
    difficulty: 2,
  },

  // ── Caching & Redis ───────────────────────────────────────────────────────
  {
    category: 'technical',
    tags: ['redis', 'caching', 'cache', 'cache invalidation', 'key-value', 'memcached', 'latency'],
    prompt: 'What are the main cache invalidation strategies (e.g., Cache-Aside, Write-Through, Write-Behind), and how do you prevent cache stampedes (thundering herd)?',
    answer_outline:
      'Cache-Aside queries cache first, reads from DB on miss, and writes back. Write-Through updates cache and DB synchronously. To prevent cache stampedes on TTL expiry, use probabilistic early expiration (XFetch), mutex locking (single flight), or pre-computing hot keys.',
    evaluation_criteria: [
      'Accurately explains Cache-Aside flow and cache miss penalty',
      'Identifies the thundering herd problem when hot cache keys expire',
      'Proposes locking (Redis SETNX lock) or background jittered refresh to mitigate stampedes',
    ],
    difficulty: 3,
  },

  // ── Node.js & TypeScript & Asynchronous Runtimes ───────────────────────────
  {
    category: 'technical',
    tags: ['node.js', 'typescript', 'javascript', 'event loop', 'async', 'promises'],
    prompt: 'Explain the Node.js Event Loop phases and how microtasks (process.nextTick, Promise callbacks) differ from macrotasks (setTimeout, setImmediate).',
    answer_outline:
      'The libuv event loop has phases: Timers, Pending Callbacks, Idle/Prepare, Poll (I/O), Check (setImmediate), and Close Callbacks. Microtasks execute immediately after the current operation finishes and before moving to the next event loop phase, with process.nextTick having highest priority over Promise jobs.',
    evaluation_criteria: [
      'Details key event loop phases (Timers, Poll, Check)',
      'Explains that microtask queues drain fully between macrotasks and phase transitions',
      'Identifies starvation risks if recursive process.nextTick() calls block the loop',
    ],
    difficulty: 2,
  },
  {
    category: 'technical',
    tags: ['typescript', 'typing', 'generics', 'type-safety', 'interface'],
    prompt: 'How do TypeScript generics and conditional types enhance compile-time type safety without runtime overhead?',
    answer_outline:
      'Generics parameterize types to enable reusable components while preserving strict type relationships. Conditional types (T extends U ? X : Y) allow dynamic type mapping based on relationships, fully erased during transpilation so runtime bundle size is unaffected.',
    evaluation_criteria: [
      'Articulates compile-time type erasure in TypeScript',
      'Demonstrates understanding of generic constraints (extends keyword)',
      'Explains how utility types like Partial, Record, and Pick are constructed',
    ],
    difficulty: 2,
  },

  // ── Databases, SQL & Data Modeling ───────────────────────────────────────
  {
    category: 'technical',
    tags: ['database', 'sql', 'postgresql', 'nosql', 'dynamodb', 'schema', 'data modeling', 'inventory'],
    prompt: `Compare relational (e.g., PostgreSQL) and NoSQL (e.g., DynamoDB) data models for storing an e-commerce product catalog that includes product details, categories, and inventory levels.

Task Requirements:
1. Write the concrete PostgreSQL schema DDL (CREATE TABLE statements with primary keys, foreign keys, and indexes) to support:
   - products (id, name, description, category_id, price)
   - categories (id, name, parent_category_id)
   - inventory (product_id, warehouse_id, quantity, last_updated)
2. Outline the DynamoDB Single-Table Design schema (Partition Key [PK], Sort Key [SK], and Global Secondary Index [GSI]) for the same entities.
3. Discuss concrete trade-offs in consistency (ACID vs eventual consistency), complex query patterns (joins vs pre-computed denormalization), and write scaling under flash sales.`,
    answer_outline:
      '1. PostgreSQL DDL: Defines normalized tables products, categories, and inventory with foreign keys and composite indexes on (category_id, price) and (product_id, warehouse_id). Ensures strong ACID transactions during checkout.\\n2. DynamoDB Single-Table: Uses PK=PROD#<id>, SK=METADATA for products, PK=PROD#<id>, SK=INV#<warehouse_id> for inventory. GSI with PK=CAT#<id>, SK=PRICE#<val> to query category products without table scans.\\n3. Trade-offs: Postgres excels at relational integrity, flexible queries, and ACID inventory decrements, but requires read replicas or sharding at high write volume. DynamoDB scales horizontally with single-digit millisecond latency at arbitrary scale, but requires strict access pattern planning and distributed locking/transactions for cross-item operations.',
    evaluation_criteria: [
      'Provides concrete PostgreSQL DDL with proper data types, foreign keys, and indexes',
      'Designs functional DynamoDB single-table schema with explicit PK, SK, and GSI access patterns',
      'Compares ACID transactions vs eventual consistency and write throughput under load',
    ],
    difficulty: 3,
  },
  {
    category: 'technical',
    tags: ['sql', 'database', 'postgresql', 'window functions', 'queries', 'analytics', 'aggregation'],
    prompt: `Given an e-commerce schema with tables:
- products (id SERIAL PRIMARY KEY, name VARCHAR(255), category_id INT, price NUMERIC(10,2))
- orders (id SERIAL PRIMARY KEY, customer_id INT, created_at TIMESTAMP)
- order_items (id SERIAL PRIMARY KEY, order_id INT REFERENCES orders(id), product_id INT REFERENCES products(id), quantity INT, unit_price NUMERIC(10,2))

Write a SQL query to find the top 2 highest revenue-generating products in each category over the past 90 days.

Requirements:
- Calculate total revenue as SUM(quantity * unit_price).
- Use window functions (e.g. DENSE_RANK() or RANK()) partitioned by category_id ordered by total revenue descending.
- Return: category_id, product_id, product_name, total_revenue, and category_revenue_rank.
- Ensure ties are handled gracefully and results are filtered to rank <= 2.`,
    answer_outline:
      "Use a Common Table Expression (CTE) to join orders, order_items, and products with a WHERE filter on orders.created_at >= NOW() - INTERVAL '90 days'. Aggregate SUM(quantity * unit_price) grouped by category_id, product_id, product_name. Compute DENSE_RANK() OVER (PARTITION BY category_id ORDER BY SUM(quantity * unit_price) DESC) as rank. In outer query, filter WHERE rank <= 2 ORDER BY category_id, rank.",
    evaluation_criteria: [
      'Correctly joins products, orders, and order_items with proper time window filter',
      'Uses CTE or subquery with DENSE_RANK() OVER (PARTITION BY category_id ORDER BY revenue DESC)',
      'Filters outer query WHERE rank <= 2 and correctly computes revenue aggregation',
    ],
    difficulty: 2,
  },
  {
    category: 'technical',
    tags: ['database', 'sql', 'postgresql', 'mysql', 'indexing', 'transactions', 'acid'],
    prompt: 'How do B-Tree indexes improve SQL query performance, and what are the write penalties associated with maintaining multiple secondary indexes?',
    answer_outline:
      'B-Trees keep data sorted and allow logarithmic O(log n) lookups, range scans, and binary searches. The write penalty is that every INSERT, UPDATE (on indexed columns), and DELETE requires rebalancing and writing to multiple index trees, increasing I/O and transaction lock contention.',
    evaluation_criteria: [
      'Explains balanced tree traversal and page splits',
      'Discusses composite index column ordering (Leftmost Prefix Rule)',
      'Identifies index maintenance write overhead during high-volume ingestion',
    ],
    difficulty: 2,
  },

  // ── Cloud, Containers & Infrastructure ────────────────────────────────────
  {
    category: 'technical',
    tags: ['cloud', 'aws', 'docker', 'kubernetes', 'containers', 'infrastructure', 's3', 'lambda'],
    prompt: 'What are the architectural trade-offs between deploying microservices on serverless functions (e.g. AWS Lambda) vs container orchestration (e.g. Kubernetes/ECS)?',
    answer_outline:
      'Serverless provides zero-maintenance auto-scaling and per-millisecond billing, but suffers from cold starts, execution timeout limits (15 min), and statelessness. Containers provide predictable latency, local state/caching, long-running processes, and portability at the cost of infrastructure management and idle resource costs.',
    evaluation_criteria: [
      'Explains cold-start latency factors (VPC attachment, runtime bootstrap)',
      'Discusses cost dynamics: intermittent bursts (Lambda) vs steady high throughput (Containers)',
      'Considers observability, connection pooling (RDS Proxy), and networking constraints',
    ],
    difficulty: 2,
  },

  // ── Object-Oriented Design & Clean Architecture ───────────────────────────
  {
    category: 'technical',
    tags: ['oop', 'design patterns', 'solid', 'clean code', 'architecture'],
    prompt: 'Explain the Single Responsibility Principle and the Dependency Inversion Principle from SOLID. How do they prevent tight coupling?',
    answer_outline:
      'Single Responsibility dictates that a class or module should have only one reason to change. Dependency Inversion asserts that high-level business logic should depend on abstractions (interfaces) rather than concrete low-level implementations, allowing dependencies to be swapped or mocked in tests.',
    evaluation_criteria: [
      'Clear definition of SRP without confusing it with doing only one single thing',
      'Explains Dependency Inversion through interface contracts and inversion of control (IoC)',
      'Discusses practical testability benefits (mocking databases/network layers)',
    ],
    difficulty: 2,
  },

  // ── Behavioral & STAR Leadership Principles ───────────────────────────────
  {
    category: 'behavioural',
    tags: ['ownership', 'leadership', 'responsibility', 'initiative', 'proactive', 'culture', 'values'],
    prompt: 'Tell me about a time when you saw a problem or technical debt outside your direct project responsibility and took initiative to fix it.',
    answer_outline:
      'Use the STAR method: Describe the Context (e.g., recurring deployment flakiness impacting multiple teams), the Action you took (investigated root causes, proposed an automated health check, documented findings), and the measurable Result (reduced deployment failures by 40%).',
    evaluation_criteria: [
      'Clear STAR structure (Situation, Task, Action, Result)',
      'Demonstrates self-directed initiative without waiting to be assigned',
      'Highlights long-term team impact and quantifiable improvement',
    ],
    difficulty: 2,
  },
  {
    category: 'behavioural',
    tags: ['customer obsession', 'empathy', 'user-centric', 'feedback', 'culture', 'values'],
    prompt: 'Give an example of a time when you had to make a technical trade-off to prioritize customer experience or user trust over technical elegance.',
    answer_outline:
      'STAR approach: Explain a situation where a complex, elegant architectural refactor would have delayed a critical user security fix or degraded checkout latency. Emphasize how you chose a pragmatic, backward-compatible solution that protected user trust first.',
    evaluation_criteria: [
      'Demonstrates customer-first mindset over developer convenience',
      'Shows thoughtful balance between immediate user reliability and technical debt',
      'Details how follow-up refactoring was scheduled post-launch',
    ],
    difficulty: 2,
  },
  {
    category: 'behavioural',
    tags: ['collaboration', 'conflict', 'disagree and commit', 'teamwork', 'communication'],
    prompt: 'Describe a situation where you had a strong technical disagreement with a teammate or lead. How did you handle the conversation and reach a resolution?',
    answer_outline:
      'STAR approach: Detail the technical debate (e.g. database choice or API contract). Emphasize grounding the discussion in objective metrics, benchmarks, and data rather than ego. If the final decision went against your preference, demonstrate how you committed 100% to making the chosen solution succeed.',
    evaluation_criteria: [
      'Demonstrates professional, blameless communication',
      'Relies on data, benchmarks, and RFC trade-offs rather than opinions',
      'Shows maturity to "disagree and commit" and support the team outcome',
    ],
    difficulty: 2,
  },
  {
    category: 'behavioural',
    tags: ['failure', 'incident', 'postmortem', 'mistake', 'learning', 'resilience'],
    prompt: 'Tell me about a time you made a significant mistake or caused a production issue. What did you learn and what safeguards did you put in place?',
    answer_outline:
      'STAR approach: Take complete ownership of the incident without deflecting blame. Describe rapid containment/rollback, conducting a blameless postmortem, and implementing systemic safeguards (e.g. automated integration tests, canary deployments, alerting) so the issue could never recur.',
    evaluation_criteria: [
      'Takes unequivocal personal accountability',
      'Focuses on root cause analysis rather than defensiveness',
      'Implements systemic, automated prevention to protect future releases',
    ],
    difficulty: 2,
  },

  // ── Testing, Quality & CI/CD ──────────────────────────────────────────────
  {
    category: 'technical',
    tags: ['testing', 'unit tests', 'integration tests', 'ci/cd', 'quality', 'tdd'],
    prompt: 'How do you structure the testing pyramid (Unit, Integration, End-to-End) to ensure fast feedback loops without sacrificing confidence?',
    answer_outline:
      'The base consists of fast, hermetic unit tests verifying edge cases and business logic in isolation. The middle consists of integration tests verifying database queries, API schemas, and contracts against real ephemeral services. The top consists of minimal end-to-end smoke tests validating critical user flows.',
    evaluation_criteria: [
      'Understands test speed and cost trade-offs across pyramid tiers',
      'Emphasizes hermetic, deterministic execution (avoiding shared test state)',
      'Explains when to mock external third-party services vs test against real databases',
    ],
    difficulty: 1,
  },
];

export interface MatchedCuratedResult {
  questions: Question[];
  coveredRequirementIds: Set<string>;
  nextQuestionIndex: number;
}

/**
 * Matches candidate job requirements against the curated template bank using
 * semantic tag overlap, generating monotonic IDs and dynamically binding requirement IDs.
 */
export function matchCuratedQuestions(
  requirements: Requirement[],
  startIndex: number = 1,
  maxMatches: number = 4
): MatchedCuratedResult {
  const matchedQuestions: Question[] = [];
  const coveredRequirementIds = new Set<string>();
  const usedTemplatePrompts = new Set<string>();

  let nextQIndex = startIndex;

  for (const req of requirements) {
    if (matchedQuestions.length >= maxMatches) break;

    const reqTextLower = req.text.toLowerCase();
    const reqKind = req.kind;

    // Search for best matching template
    let bestTemplate: CuratedQuestionTemplate | null = null;
    let maxMatchScore = 0;

    for (const template of CURATED_QUESTION_TEMPLATES) {
      if (usedTemplatePrompts.has(template.prompt)) continue;

      // Category compatibility
      if (reqKind === 'behavioural' && template.category !== 'behavioural') continue;
      if (reqKind === 'technical' && template.category !== 'technical') continue;

      let score = 0;
      for (const tag of template.tags) {
        if (reqTextLower.includes(tag.toLowerCase())) {
          score += 1;
        }
      }

      if (score > maxMatchScore) {
        maxMatchScore = score;
        bestTemplate = template;
      }
    }

    // Only bind if there is a genuine keyword match (score >= 1)
    if (bestTemplate && maxMatchScore >= 1) {
      usedTemplatePrompts.add(bestTemplate.prompt);
      const qId = genQIds(1, nextQIndex - 1)[0];
      nextQIndex++;

      matchedQuestions.push({
        id: qId,
        requirement_ids: [req.id],
        category: bestTemplate.category,
        prompt: bestTemplate.prompt,
        answer_outline: bestTemplate.answer_outline,
        difficulty: bestTemplate.difficulty,
      });

      coveredRequirementIds.add(req.id);
    }
  }

  return {
    questions: matchedQuestions,
    coveredRequirementIds,
    nextQuestionIndex: nextQIndex,
  };
}

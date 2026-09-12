# Recon (`FS-AI-INTERVIEW-01`) — Assessment Video Walkthrough Script

> **Target Duration**: 3 minutes 45 seconds (225 seconds)  
> **Format**: Screencast with voiceover demonstration  
> **Resolution**: 1080p (1920x1080), 60 FPS  
> **Presenter Persona**: Lead Full-Stack & AI Systems Architect  

---

## Storyboard & Timing Overview

```
 0:00 ─── 0:45  Act 1: Single-Role Kit Creation & Live 5-Step Pipeline
 0:45 ─── 1:30  Act 2: Research Intelligence, Honest Degradation & Gap Healing
 1:30 ─── 2:15  Act 3: The Builder — Inline Mutations, Pinning & Sectional Regeneration
 2:15 ─── 3:00  Act 4: Active Practice — 3D Study Deck, Spaced Repetition & Study Timer
 3:00 ─── 3:45  Act 5: Creative Feature (Weak-Spot Gap Radar), AI Mock Interview & Defense
```

---

## Detailed Act Breakdown

### Act 1: Single-Role Kit Creation & Live 5-Step Pipeline (0:00 – 0:45)

* **Visual Scene**:
  - Browser opens on candidate dashboard (`http://localhost:3000/dashboard`).
  - Click **"+ Generate New Kit"**.
  - Paste real-world Job Description: *"Staff Backend Distributed Systems Engineer at Stripe"*.
  - Enter Company URL: `https://stripe.com`. Set Days Available = `7`.
  - Click **"Synthesize Prep Kit"**.
  - Screen transitions to the real-time **5-step animated progress stepper**:
    1. *Validating Inputs & Safety Shield (SSRF + Robots.txt)*
    2. *Researching Company Culture & Tech Stack*
    3. *Extracting Requirements & Synthesizing Role Brief*
    4. *Generating Curated Questions & Flashcards*
    5. *Enforcing Coverage & Calculating Study Schedule*
  - Stepper smoothly advances with status icons, elapsed time clock, and sub-second updates until the workspace loads.

* **Voiceover**:
  > *"Welcome to Recon, an enterprise-grade AI interview preparation engine built for the FS-AI-INTERVIEW-01 assessment.*
  > 
  > *We start by creating a new prep kit from a real Staff Distributed Systems Engineer job description at Stripe. With a 7-day preparation horizon, we submit the role.*
  > 
  > *Notice that instead of hanging on an HTTP connection, our Express API returns an immediate `202 Accepted` with a durable session ID. A 2.5-second polling engine drives our real-time 5-step generation stepper, tracking socket-pinned SSRF verification, multi-page company research, structured Gemini LLM synthesis, deterministic gap-healing, and mathematical schedule allocation.*
  > 
  > *In seconds, the complete interview workspace is loaded."*

* **Architectural Invariants Highlighted**:
  - `POST /api/kits` returns `202 Accepted` immediately.
  - Client utilizes low-overhead `2.5s` polling engine against `/api/kits/:id/progress`.
  - Sub-millisecond in-memory cache with durable MongoDB checkpoints prevents DB thrashing.
  - Idempotent request deduplication via SHA-256 JD hash prevents duplicate LLM bills.

---

### Act 2: Research Intelligence, Honest Degradation & Gap Healing (0:45 – 1:30)

* **Visual Scene**:
  - On the generated kit workspace, click the **"Company Brief"** tab.
  - Show the extracted company summary: business model, engineering culture, tech stacks, and interview discussion notes.
  - Highlight the **"Sources Used"** tag listing discovered career and engineering links.
  - Briefly demonstrate **Honest Degradation**: show another kit generated with an unreachable domain or pure-JavaScript client stub (`http://localhost:8099` fixture or blocked URL), showing clean amber degradation callout: *"External site blocked by robots.txt or required client-side JS; degraded gracefully to pure JD synthesis without crashing"*.
  - Switch to the **"Role Breakdown"** tab. Show the extracted `r1..rn` requirements categorized into `technical`, `behavioural`, and `domain`, with strict `must` vs `nice` priority badges.
  - Point to the **Coverage Bar (100% Must-Have)**. Show the `CoverageSchema` metadata (`passes: 2`, `uncovered_requirement_ids: []`).

* **Voiceover**:
  > *"Let's inspect the intelligence layer. In the Company Brief tab, Recon synthesizes Stripe's business model, tech stack, and public engineering insights.*
  > 
  > *Our crawler uses native Undici socket pinning to prevent TOCTOU DNS rebinding SSRF attacks, respects RFC 9309 robots.txt rules, and ranks internal career links using a weighted heuristic.*
  > 
  > *If a company URL is unreachable, returns 404, or is an anti-bot protected SPA, Recon never crashes. It logs an honest degradation notice, falls back gracefully, and synthesizes the kit entirely from the JD.*
  > 
  > *Under Role Breakdown, notice our strict monotonic ID generator (`r1` through `r8`). In Step 5 of the pipeline, our deterministic coverage engine verified that 100% of 'must' requirements had at least one linked question. If a gap was detected, the orchestrator automatically launched a bounded second-pass LLM call targeted only at the missing IDs, ensuring mathematical completeness."*

* **Architectural Invariants Highlighted**:
  - DNS Rebinding SSRF defense: IP validated, pinned directly to socket connection.
  - RFC 9309 robots.txt parser with 250ms rate limit and 2MB stream cap.
  - Honest degradation: failures logged to `research.degradations[]`, pipeline continues.
  - Deterministic D4.1 coverage verification + D4.2 bounded 2nd-pass gap repair.

---

### Act 3: The Builder — Inline Mutations, Pinning & Sectional Regeneration (1:30 – 2:15)

* **Visual Scene**:
  - Switch to the **"Question Bank"** tab.
  - Click on a technical question to expand its prompt, difficulty badge, and structured answer outline.
  - Click the **"Edit"** pencil icon on question `q2`. Edit the prompt to add custom context: *"Explain how Stripe handles idempotent API requests using Redis"*. Save edit. Notice the blue `Edited` tag appears.
  - Click the **Pin icon** (`📌`) on question `q3`. The pin activates with a golden badge: *"Pinned (Protected from regeneration)"*.
  - Click **"+ Add Question"**. Add custom manual question `q_manual_1`: *"Walk me through distributed consensus in Raft"*. Notice the green `Manual` tag.
  - Click the **"Regenerate Category"** button on the `technical` category header.
  - A singleton confirmation modal appears with a diff warning: *"3 questions will be regenerated. 1 pinned question and 1 manual question will be preserved."*
  - Click **"Confirm & Regenerate"**.
  - Stepper runs briefly. When updated:
    - Unpinned questions are refreshed with new prompts.
    - Pinned question `q3` remains completely unchanged with its pin intact.
    - Custom manual question is preserved.
    - Version increments atomically via Optimistic Concurrency Control (OCC).

* **Voiceover**:
  > *"Now let's look at Domain 6: The Builder — our interactive workbench.*
  > 
  > *Candidates can freely customize their kit. I can expand any question, edit the prompt inline to add specific architectural details, and save. The kit tracks this with an `isEdited` flag.*
  > 
  > *If there's a critical question I love, I can click the Pin icon. I can also manually add proprietary questions.*
  > 
  > *When I click 'Regenerate Technical Category', Recon triggers our protected merge engine. Notice the confirmation gate: it warns me before overriding.*
  > 
  > *Upon regeneration, our merge algorithm isolates pinned and manual items, deletes only unpinned questions in that category, allocates fresh monotonic IDs, and recombines them while guaranteeing optimistic concurrency control via document versioning. Zero lost user work."*

* **Architectural Invariants Highlighted**:
  - State preservation: `origin: 'ai' | 'user' | 'regenerated'`, `isPinned: boolean`, `isEdited: boolean`.
  - Protected sectional regeneration: pinned and manual items immune to regeneration.
  - Singleton confirmation gate with destructive action diffing.
  - OCC versioning (`version: number`) returning `409 CONCURRENT_MODIFICATION` on stale writes.

---

### Act 4: Active Practice — 3D Study Deck, Spaced Repetition & Study Timer (2:15 – 3:00)

* **Visual Scene**:
  - Switch to the **"Flashcards (Study Deck)"** tab.
  - Show the sleek, distraction-free 3D flip study card.
  - Press `Spacebar` (or click card) — card flips smoothly with a 3D perspective flip showing the concise answer outline.
  - Press key `1` for *"Shaky (Red)"*. The rating records, card counter advances to Card 2.
  - Press `Spacebar`, press key `3` for *"Mastered (Green)"*. Card 3 loads.
  - Show the Spaced Repetition queue filter: select *"Shaky First"*. Cards rated `1` immediately jump to the front of the study queue.
  - Switch to the **"Study Schedule"** tab.
  - Show the 7-day calendar. Show that Day 1 is front-loaded with Difficulty 3 technical questions, respecting the front-loading invariant `(difficulty DESC, isMust DESC, id ASC)`.
  - Click the **"Focus Session: Day 1 (45m)"** timer button.
  - A persistent emerald countdown timer appears in the workspace header with pulsing live seconds, active pause/resume controls, and a direct link back to Day 1 focus questions.
  - Click on question `q1` inside Day 1's schedule card — UI instantly switches tabs to the Question Bank, auto-expands `q1`, resets filters, and smoothly scrolls to it with a pulsing highlight ring.

* **Voiceover**:
  > *"Preparation requires deliberate practice. In Domain 7, Recon provides a distraction-free 3D Study Deck.*
  > 
  > *Using ergonomic keyboard shortcuts — Spacebar to flip, and keys 1, 2, or 3 to rate — candidates evaluate their recall. Sessions persist durably into MongoDB.*
  > 
  > *Our Spaced Repetition algorithm computes dynamic urgency weights based on confidence and temporal decay, ensuring unpracticed and shaky cards always surface first.*
  > 
  > *Over in the Study Schedule, our deterministic allocator front-loads the hardest, must-have questions into early days so candidates never cram system design on Day 7.*
  > 
  > *Candidates can launch an integrated Day Focus Countdown Timer, and clicking any scheduled question instantly navigates to and highlights the exact prompt in the Question Bank."*

* **Architectural Invariants Highlighted**:
  - Flashcard 3D flip animation with full keyboard ergonomics (`Space`, `1`, `2`, `3`, `←`, `→`).
  - Spaced Repetition formula: `weight = (4 - confidence) * (1 / daysSince + 1)`.
  - Study Schedule allocation invariant: difficulty-first front-loading with integer minutes conservation.
  - Deep-link cross-tab navigation with smooth scroll and target highlight.

---

### Act 5: Creative Feature (Weak-Spot Gap Radar), AI Mock Interview & Defense (3:00 – 3:45)

* **Visual Scene**:
  - Switch to the **"Weak-Spot Radar"** tab.
  - Display the interactive Readiness Gap chart mapping each Job Requirement (`r1` to `r8`) to real-time readiness percentages.
  - Point to `r2 (Distributed Systems & Raft)` showing `33% Readiness` in red with a prominent **"DANGER ZONE"** banner.
  - Point to `r1 (REST & API Architecture)` showing `100% Readiness` in green.
  - Explain the Zero-Overstatement denominator formula.
  - Open the **"AI Mock Interview"** simulator drawer.
  - Click **"Start 1-on-1 Voice Call"** to demonstrate the realistic two-way conversational voice interview: show the live AI interviewer audio equalizer bars dancing as the AI speaks the question, the echo-safe microphone handoff, and the live candidate speech-to-text transcript.
  - Demonstrate the **LeetCode Test Cases Panel** with copyable inputs/expected outputs and click the green **"Run & Check"** button to show real-time AI solution validation with execution verdicts (`Accepted`), test case pass counters (`2/2 Passed`), and Big-O complexity profiling.
  - Run the evaluation CLI in terminal:
    ```bash
    npm run evaluate -- --input tests/cli/fixtures/test-cases.json --output tmp/kits.json --mock
    ```
  - Terminal outputs 5/5 valid kits adhering to Appendix B schema in 0.3 seconds.
  - Conclude with architecture slide / README documentation summary.

* **Voiceover**:
  > *"Finally, our signature creative feature: the Weak-Spot Gap Radar.*
  > 
  > *Traditional flashcards tell you which cards you missed. Our Radar maps every flashcard rating directly back to the original Job Requirements. Using our mathematically verified zero-overstatement formula, unpracticed cards count as zero in the numerator while fully expanding the denominator. If a must-have skill is under-practiced, a Danger Zone alert flags the critical blind spot before the real interview.*
  > 
  > *We've also built a true 1-on-1 Live Voice Interview call with real-time audio equalizers, natural speech synthesis, and echo-suppressed hands-free dialogue. Candidates can speak naturally with the AI interviewer, write code in our clean polyglot workspace, and run automated LeetCode test cases with real-time Accepted verdicts and Big-O profiling.*
  > 
  > *And under the hood, our batch CLI runner `npm run evaluate` executes the exact same core pipeline headless, producing Appendix B-compliant output in under 5 minutes for 5 test cases.*
  > 
  > *Recon delivers 100% test coverage across 380 unit and integration tests, strict TypeScript types, zero parallel implementations, and production-ready resilience. Thank you."*

* **Architectural Invariants Highlighted**:
  - Weak-Spot Gap Radar formula: `readiness = sum(ratings) / (N * 3) * 100` (unpracticed = 0 numerator, $N \times 3$ denominator).
  - Polyglot Code Workspace with clean LeetCode skeletons & real-time test case execution verdicts (`Accepted` / `Wrong Answer` / `Needs Revision`).
  - Headless CLI sharing identical `generateKit` pipeline with web server.
  - 100% hermetic test suite (380 tests, 45 test files passing).
  - Appendix B JSON schema compliance.

---

## Technical Recording Checklist for Presenter

1. **Pre-flight**:
   - Ensure local MongoDB and Redis are running (`docker compose up -d`).
   - Run `npm run dev` to have API on `:4000` and Web on `:3000`.
   - Pre-clear any old test kits or start with a clean test user (`candidate@recon.dev`).
2. **Audio & Video Setup**:
   - Set screen resolution to 1080p, display scale 100%.
   - Hide browser bookmarks bar and OS taskbar auto-hide if preferred.
   - Use high-quality cardioid USB microphone with quiet ambient noise.
3. **Pacing & Timing**:
   - Do not rush clicks; allow the 5-step stepper animation and card flips 1.5–2 seconds to register on video.
   - Total time must stay between 3:00 and 4:00 minutes.

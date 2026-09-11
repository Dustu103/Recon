import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { KitModel } from '../src/api/kits/models/kit.model';
import { UserModel } from '../src/api/auth/models/user.model';

async function seed() {
  await mongoose.connect('mongodb://localhost:27017/taro');
  console.log('Connected to MongoDB');

  // Clear existing
  await UserModel.deleteMany({});
  await KitModel.deleteMany({});

  const passwordHash = await bcrypt.hash('Password123!', 10);
  const user = await UserModel.create({
    email: 'test@recon.ai',
    passwordHash,
    isVerified: true,
  });

  const fullKit = {
    source: {
      company: 'Stripe',
      company_url: 'https://stripe.com',
      role: 'Staff Infrastructure Engineer',
      location: 'Remote, US',
      jd_chars: 1450,
      researched_at: new Date().toISOString(),
      pages_used: ['https://stripe.com/jobs', 'https://stripe.com/about'],
    },
    company_brief: {
      summary: 'Stripe is a financial infrastructure platform for businesses millions use to accept payments.',
      what_they_do: 'Global economic infrastructure, real-time payment rails, and ledger compliance engines.',
      sources: ['https://stripe.com/about'],
    },
    role: {
      title: 'Staff Infrastructure Engineer',
      seniority: 'Staff',
      responsibilities: [
        'Architect planetary-scale payment pipelines with 99.999% uptime',
        'Lead core database migration to distributed ledger architecture',
        'Mentor principal and senior engineers across infrastructure teams',
      ],
      requirements: [
        {
          id: 'r1',
          text: 'React & Frontend Infrastructure at Scale',
          kind: 'technical',
          priority: 'must',
        },
        {
          id: 'r2',
          text: 'Distributed Consensus & High-Throughput Event Systems',
          kind: 'technical',
          priority: 'must',
        },
        {
          id: 'r3',
          text: 'CQRS & Event Sourcing Architecture',
          kind: 'technical',
          priority: 'nice',
        },
        {
          id: 'r4',
          text: 'Executive Stakeholder Alignment & Cross-Functional Influence',
          kind: 'behavioural',
          priority: 'must',
        },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How does React reconciliation work under the hood with Fiber?',
        answer_outline: 'Explain Fiber tree, work loop, and diffing algorithm.',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'technical',
        prompt: 'How do you guarantee exactly-once processing in a high-throughput event pipeline?',
        answer_outline: 'Explain idempotent producer, transactional outbox, two-phase commit.',
        difficulty: 3,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is the React Fiber architecture and how does cooperative scheduling work?',
        back: 'Fiber breaks reconciliation into incremental units of work (fibers). It uses requestIdleCallback / MessageChannel to pause and resume work without blocking the main browser thread.',
        requirement_ids: ['r1'],
      },
      {
        id: 'f2',
        front: 'Explain React 18 Concurrent Rendering lanes and priority levels.',
        back: 'Lanes represent bitmasks indicating update priority (SyncLane, InputContinuousLane, DefaultLane, IdleLane). React can interrupt low-priority rendering to process urgent user keystrokes.',
        requirement_ids: ['r1'],
      },
      {
        id: 'f3',
        front: 'How does Raft handle leader election during network partitions?',
        back: 'A node transitions to Candidate state upon election timeout, increments term, and requests votes. Split-brain is prevented because electing a leader requires a strict majority quorum of cluster nodes.',
        requirement_ids: ['r2'],
      },
      {
        id: 'f4',
        front: 'What strategies ensure zero message loss across Kafka consumer rebalances?',
        back: 'Set enable.auto.commit=false, use synchronous or transactional commit hooks after persisting business state, and employ cooperative sticky partition assignors.',
        requirement_ids: ['r2'],
      },
      {
        id: 'f5',
        front: 'What are the main latency vs consistency tradeoffs of CQRS and Event Sourcing?',
        back: 'Write model is append-only with high throughput; read model projections introduce eventual consistency delay. Replaying events enables point-in-time auditability at the cost of projection lag.',
        requirement_ids: ['r3'],
      },
      {
        id: 'f6',
        front: 'How do you resolve a fundamental architectural disagreement with another Staff Engineer?',
        back: 'Anchor on customer outcomes and formal SLAs. Develop isolated proof-of-concept benchmarks, document trade-offs in an RFC, and seek consensus through empirical data rather than tenure.',
        requirement_ids: ['r4'],
      },
    ],
    schedule: {
      days_available: 3,
      days: [
        {
          day: 1,
          focus: 'Distributed Systems & Consensus',
          question_ids: ['q2'],
          minutes: 60,
        },
        {
          day: 2,
          focus: 'Frontend Architecture & Fiber',
          question_ids: ['q1'],
          minutes: 45,
        },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  };

  const kitDoc = await KitModel.create({
    userId: user._id.toString(),
    companyUrl: 'https://stripe.com',
    jobDescription: 'Staff Infrastructure Engineer at Stripe responsible for global payment rails.',
    days: 3,
    status: 'completed',
    kit: fullKit,
    practiceHistory: [],
    progress: {
      notes: {},
      starred: [],
      flashcardMastery: {},
      completedDays: [],
    },
  });

  console.log(`Seeded user: ${user.email} (Password123!)`);
  console.log(`Seeded kit ID: ${kitDoc._id}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { describe, it, expect } from 'vitest';
import { calculateWeakSpotRadar } from '../../weak-spot-radar';
import { Role, Flashcard, PracticeHistoryEntry } from '@taro/shared';

describe('Domain 7: Weak-Spot Gap Radar', () => {
  const mockRole: Role = {
    title: 'Senior Distributed Systems Engineer',
    seniority: 'Senior',
    responsibilities: ['Architect fault-tolerant microservices'],
    requirements: [
      { id: 'r1', text: 'Distributed consensus (Raft/Paxos)', kind: 'technical', priority: 'must' },
      { id: 'r2', text: 'Kubernetes operational debugging', kind: 'technical', priority: 'must' },
      { id: 'r3', text: 'Stakeholder communication', kind: 'behavioural', priority: 'nice' },
      { id: 'r4', text: 'Zero linked requirement', kind: 'domain', priority: 'must' },
    ],
  };

  const mockCards: Flashcard[] = [
    // r1 has 2 cards: f1, f2
    { id: 'f1', front: 'What is Raft leader election?', back: 'Heartbeats and term timeouts', requirement_ids: ['r1'] },
    { id: 'f2', front: 'What is split-brain?', back: 'Partition causing multiple leaders', requirement_ids: ['r1'] },
    // r2 has 2 cards: f3, f4
    { id: 'f3', front: 'How to debug CrashLoopBackOff?', back: 'Check logs, describe pod, liveness probe', requirement_ids: ['r2'] },
    { id: 'f4', front: 'What is OOMKilled 137?', back: 'Container exceeded memory limit', requirement_ids: ['r2'] },
    // r3 has 1 card: f5
    { id: 'f5', front: 'Describe executive alignment', back: 'Lead with business impact', requirement_ids: ['r3'] },
    // r4 has 0 cards linked
  ];

  it('matches plan test: r1 with 1 rated "3" and 1 unpracticed yields exactly 50%', () => {
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 3, practicedAt: new Date() }, // 3/3
      // f2 unpracticed: contributes 0
    ];

    const radar = calculateWeakSpotRadar(mockRole, mockCards, history);
    const r1 = radar.requirements.find((r) => r.requirementId === 'r1')!;

    // (3 + 0) / (2 * 3) = 50%
    expect(r1.readiness).toBe(50);
    expect(r1.practicedCardCount).toBe(1);
    expect(r1.unpracticedCardCount).toBe(1);
    // r1 has 1 card practiced, so it is NOT danger zone, but it IS partially unprepared (unpracticedCardCount > 0)
    expect(r1.isDangerZone).toBe(false);
    expect(r1.isPartiallyUnprepared).toBe(true);
  });

  it('matches plan test: r2 with 2 cards rated "1" and "1" yields 33%', () => {
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f3', confidence: 1, practicedAt: new Date() },
      { cardId: 'f4', confidence: 1, practicedAt: new Date() },
    ];

    const radar = calculateWeakSpotRadar(mockRole, mockCards, history);
    const r2 = radar.requirements.find((r) => r.requirementId === 'r2')!;

    // (1 + 1) / (2 * 3) = 2/6 = 33.3% -> rounds to 33%
    expect(r2.readiness).toBe(33);
    expect(r2.practicedCardCount).toBe(2);
    expect(r2.unpracticedCardCount).toBe(0);
    expect(r2.isDangerZone).toBe(false);
    expect(r2.isPartiallyUnprepared).toBe(true); // readiness < 50
  });

  it('matches plan test: r3 with 1 card rated "3" yields 100%', () => {
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f5', confidence: 3, practicedAt: new Date() },
    ];

    const radar = calculateWeakSpotRadar(mockRole, mockCards, history);
    const r3 = radar.requirements.find((r) => r.requirementId === 'r3')!;

    // 3 / (1 * 3) = 100%
    expect(r3.readiness).toBe(100);
    expect(r3.isDangerZone).toBe(false);
    expect(r3.isPartiallyUnprepared).toBe(false);
  });

  it('all unpracticed yields 0% readiness and triggers isDangerZone on must requirements', () => {
    const radar = calculateWeakSpotRadar(mockRole, mockCards, []);

    const r1 = radar.requirements.find((r) => r.requirementId === 'r1')!;
    const r2 = radar.requirements.find((r) => r.requirementId === 'r2')!;
    const r3 = radar.requirements.find((r) => r.requirementId === 'r3')!;
    const r4 = radar.requirements.find((r) => r.requirementId === 'r4')!;

    expect(r1.readiness).toBe(0);
    expect(r1.isDangerZone).toBe(true); // Must + 0 practiced

    expect(r2.readiness).toBe(0);
    expect(r2.isDangerZone).toBe(true); // Must + 0 practiced

    expect(r3.readiness).toBe(0);
    expect(r3.isDangerZone).toBe(false); // Nice priority, not a danger zone

    expect(r4.readiness).toBe(0); // Zero linked cards -> 0%
    expect(r4.isDangerZone).toBe(true); // Must requirement with zero practice

    expect(radar.overallReadiness).toBe(0);
    expect(radar.hasDangerZone).toBe(true);
    expect(radar.dangerZoneCount).toBe(3); // r1, r2, r4
  });
});

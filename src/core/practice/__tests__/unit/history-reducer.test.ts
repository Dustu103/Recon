import { describe, it, expect } from 'vitest';
import { getLatestRatingsMap } from '../../history-reducer';
import { PracticeHistoryEntry } from '@taro/shared';

describe('Domain 7: Practice History Reducer', () => {
  it('returns empty map for empty or null history', () => {
    expect(getLatestRatingsMap(null).size).toBe(0);
    expect(getLatestRatingsMap([]).size).toBe(0);
  });

  it('correctly maps single ratings for cards', () => {
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 1, practicedAt: new Date('2026-09-01T10:00:00Z') },
      { cardId: 'f2', confidence: 3, practicedAt: new Date('2026-09-01T10:05:00Z') },
    ];

    const map = getLatestRatingsMap(history);
    expect(map.size).toBe(2);
    expect(map.get('f1')?.confidence).toBe(1);
    expect(map.get('f2')?.confidence).toBe(3);
  });

  it('selects latest rating when a card has multiple entries with different timestamps', () => {
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 1, practicedAt: new Date('2026-09-01T10:00:00Z') },
      { cardId: 'f1', confidence: 2, practicedAt: new Date('2026-09-02T10:00:00Z') },
      { cardId: 'f1', confidence: 3, practicedAt: new Date('2026-09-03T10:00:00Z') },
      { cardId: 'f1', confidence: 1, practicedAt: new Date('2026-09-02T15:00:00Z') }, // Out of order entry
    ];

    const map = getLatestRatingsMap(history);
    expect(map.get('f1')?.confidence).toBe(3);
    expect(map.get('f1')?.practicedAt.toISOString()).toBe(new Date('2026-09-03T10:00:00Z').toISOString());
  });

  it('resolves deterministic tie-break using higher array index when timestamps are identical', () => {
    const sameTime = new Date('2026-09-05T12:00:00.000Z');
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 1, practicedAt: sameTime },
      { cardId: 'f1', confidence: 3, practicedAt: sameTime }, // Later array index
    ];

    const map = getLatestRatingsMap(history);
    expect(map.get('f1')?.confidence).toBe(3);
    expect(map.get('f1')?.index).toBe(1);
  });
});

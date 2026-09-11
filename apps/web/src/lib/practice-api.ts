import { PracticeRatingItem, SpacedRepetitionFilter } from '@taro/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface PracticeAnalyticsResponse {
  totalCards: number;
  practicedCardCount: number;
  coveragePercentage: number;
  weakSpotRadar: {
    overallReadiness: number;
    totalMustRequirements: number;
    dangerZoneCount: number;
    hasDangerZone: boolean;
    requirements: Array<{
      requirementId: string;
      text: string;
      kind: 'technical' | 'behavioural' | 'domain';
      priority: 'must' | 'nice';
      readiness: number;
      totalLinkedCards: number;
      practicedCardCount: number;
      unpracticedCardCount: number;
      isDangerZone: boolean;
      isPartiallyUnprepared: boolean;
    }>;
  };
  queue: Array<{
    card: {
      id: string;
      front: string;
      back: string;
      requirement_ids: string[];
      _edited?: boolean;
      _manual?: boolean;
    };
    weight: number;
    lastPracticedAt: string | null;
    lastConfidence: 1 | 2 | 3 | null;
    isUnpracticed: boolean;
  }>;
}

export const practiceApi = {
  /**
   * Records flashcard practice ratings for a kit session.
   */
  async recordPracticeSession(
    kitId: string,
    ratings: PracticeRatingItem[]
  ): Promise<{
    recordedCount: number;
    coveragePercentage: number;
    practicedCardCount: number;
    totalCards: number;
    weakSpotRadar: PracticeAnalyticsResponse['weakSpotRadar'];
    queue: PracticeAnalyticsResponse['queue'];
  }> {
    const res = await fetch(`${API_BASE_URL}/kits/${kitId}/practice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ ratings }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to record practice session');
    }
    return data.data;
  },

  /**
   * Fetches practice analytics, Spaced Repetition Queue, and Weak-Spot Radar.
   */
  async getPracticeAnalytics(
    kitId: string,
    filter: SpacedRepetitionFilter = 'all'
  ): Promise<PracticeAnalyticsResponse> {
    const res = await fetch(
      `${API_BASE_URL}/kits/${kitId}/practice?filter=${filter}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Failed to fetch practice analytics');
    }
    return data.data;
  },
};

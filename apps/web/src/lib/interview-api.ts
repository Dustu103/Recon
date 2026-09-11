import {
  InterviewTurnInput,
  InterviewTurnResponse,
  InterviewReportInput,
  InterviewReport,
} from '@taro/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

class InterviewApiClient {
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Interview request failed (${res.status})`);
    }

    return data.data;
  }

  /**
   * Dispatches a candidate's turn (verbal transcript/chat + C++/JS code) to the AI interviewer.
   */
  async sendTurn(kitId: string, payload: InterviewTurnInput): Promise<InterviewTurnResponse> {
    return this.request<InterviewTurnResponse>(`/kits/${kitId}/interview/turn`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Requests a comprehensive session performance and recurring error report.
   */
  async generateReport(kitId: string, payload: InterviewReportInput): Promise<InterviewReport> {
    return this.request<InterviewReport>(`/kits/${kitId}/interview/report`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const interviewApi = new InterviewApiClient();

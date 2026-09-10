import { UserPayload, ErrorCode } from '@taro/shared';

export class ApiClientError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Essential for SameSite=Lax taro_session cookie
  });

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  }

  if (!response.ok) {
    const code = data?.error?.code || ErrorCode.INTERNAL_ERROR;
    const message = data?.error?.message || response.statusText || 'An unexpected error occurred';
    throw new ApiClientError(code, message, response.status);
  }

  return data as T;
}

export const authApi = {
  async register(input: { email: string; password: string }): Promise<{ user: UserPayload }> {
    return apiFetch<{ user: UserPayload }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async sendOtp(input: {
    email: string;
    password: string;
  }): Promise<{ status: string; email: string; cooldownSeconds: number; devOtp?: string }> {
    return apiFetch<{
      status: string;
      email: string;
      cooldownSeconds: number;
      devOtp?: string;
    }>('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async verifyOtp(input: {
    email: string;
    otp: string;
  }): Promise<{ user: UserPayload }> {
    return apiFetch<{ user: UserPayload }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async resendOtp(input: {
    email: string;
  }): Promise<{ status: string; email: string; cooldownSeconds: number; devOtp?: string }> {
    return apiFetch<{
      status: string;
      email: string;
      cooldownSeconds: number;
      devOtp?: string;
    }>('/api/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async forgotPassword(input: {
    email: string;
  }): Promise<{ status: string; message: string; cooldownSeconds: number; devResetLink?: string }> {
    return apiFetch<{
      status: string;
      message: string;
      cooldownSeconds: number;
      devResetLink?: string;
    }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async resetPassword(input: {
    token: string;
    newPassword: string;
  }): Promise<{ status: string; message: string; email: string }> {
    return apiFetch<{ status: string; message: string; email: string }>(
      '/api/auth/reset-password',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  },

  async login(input: { email: string; password: string }): Promise<{ user: UserPayload }> {
    return apiFetch<{ user: UserPayload }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async logout(): Promise<{ status: string }> {
    return apiFetch<{ status: string }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async me(): Promise<{ user: UserPayload }> {
    return apiFetch<{ user: UserPayload }>('/api/auth/me', {
      method: 'GET',
    });
  },
};

export const researchApi = {
  async crawl(companyUrl: string): Promise<{ success: boolean; data: any }> {
    return apiFetch<{ success: boolean; data: any }>('/api/research/crawl', {
      method: 'POST',
      body: JSON.stringify({ companyUrl }),
    });
  },
};

export interface GenerateKitInput {
  jd: string;
  companyUrl: string;
  days: number;
  roleTitle?: string;
  jobUrl?: string;
}

export interface KitListItem {
  _id: string;
  title: string;
  companyName: string;
  companyUrl: string;
  roleTitle: string;
  days: number;
  status: 'generating' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface KitDetail {
  _id: string;
  userId: string;
  title: string;
  companyName: string;
  companyUrl: string;
  roleTitle: string;
  days: number;
  jobDescription: string;
  kit: any;
  status: 'generating' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export const kitsApi = {
  async generate(
    input: GenerateKitInput,
    onProgress?: (progress: { step: string; percent: number; message: string }) => void
  ): Promise<{ kitId: string; kit: any }> {
    // Attempt SSE streaming first for rich real-time UI feedback
    if (typeof window !== 'undefined' && 'ReadableStream' in window) {
      try {
        const response = await fetch('/api/kits/generate?stream=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(input),
          credentials: 'include',
        });

        if (response.ok && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let result: { kitId: string; kit: any } | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const block of lines) {
              const eventMatch = block.match(/event:\s*(\w+)/);
              const dataMatch = block.match(/data:\s*(\{.*\})/s);
              if (dataMatch) {
                const event = eventMatch ? eventMatch[1] : 'message';
                const payload = JSON.parse(dataMatch[1]);
                if (event === 'progress' && onProgress) {
                  onProgress(payload);
                } else if (event === 'complete') {
                  result = payload;
                } else if (event === 'error') {
                  throw new ApiClientError(payload.code, payload.message, 400);
                }
              }
            }
          }

          if (result) return result;
        }
      } catch (err) {
        if (err instanceof ApiClientError) throw err;
        // Fallback to standard JSON POST
      }
    }

    const res = await apiFetch<{ success: boolean; data: { kitId: string; kit: any } }>(
      '/api/kits/generate',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
    return res.data;
  },

  async list(): Promise<KitListItem[]> {
    const res = await apiFetch<{ success: boolean; data: KitListItem[] }>('/api/kits', {
      method: 'GET',
    });
    return res.data;
  },

  async get(id: string): Promise<KitDetail> {
    const res = await apiFetch<{ success: boolean; data: KitDetail }>(`/api/kits/${id}`, {
      method: 'GET',
    });
    return res.data;
  },

  async update(id: string, input: { title?: string; kit?: any }): Promise<KitDetail> {
    const res = await apiFetch<{ success: boolean; data: KitDetail }>(`/api/kits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiFetch<{ success: boolean; message: string }>(`/api/kits/${id}`, {
      method: 'DELETE',
    });
  },
};

export interface JobOpportunityItem {
  id: string;
  title: string;
  companyName: string;
  companyUrl: string;
  jobUrl: string;
  location?: string;
  descriptionSnippet?: string;
  seniority?: string;
  status: 'active' | 'closed' | 'reported_closed';
  verifiedAt: string;
  createdAt: string;
}

export const jobsApi = {
  async list(params?: { search?: string; limit?: number }): Promise<{ jobs: JobOpportunityItem[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return apiFetch<{ jobs: JobOpportunityItem[]; total: number }>(`/api/jobs${qs}`, {
      method: 'GET',
    });
  },

  async reportClosed(jobId: string): Promise<{ success: boolean; status: string }> {
    return apiFetch<{ success: boolean; status: string }>('/api/jobs/report', {
      method: 'POST',
      body: JSON.stringify({ jobId }),
    });
  },
};




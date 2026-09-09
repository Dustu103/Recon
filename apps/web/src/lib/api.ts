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

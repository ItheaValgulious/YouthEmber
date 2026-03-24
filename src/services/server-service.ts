import { CapacitorHttp } from '@capacitor/core';

export type RemoteTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'acknowledged';

export interface ServerUser {
  id: string;
  username: string;
}

export interface AuthPayload {
  user: ServerUser;
  token: string;
  expires_at: string;
}

export interface ServerModelRecord {
  id: string;
  name: string;
}

export interface RemoteTaskUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
}

export interface RemoteTaskRecord {
  id: string;
  state: RemoteTaskStatus;
  client_request_id?: string | null;
  model_id: string;
  model_name?: string | null;
  provider?: string | null;
  retry_count?: number;
  ai_response?: string | null;
  usage?: RemoteTaskUsage | null;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
  acked_at?: string | null;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

class ServerError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ServerError';
    this.status = status;
    this.code = code;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function getConfiguredBaseUrl(): string {
  return normalizeBaseUrl(import.meta.env.VITE_SERVER_BASE_URL ?? '');
}

function ensureBaseUrl(): string {
  const baseUrl = getConfiguredBaseUrl();
  if (!baseUrl) {
    throw new Error('VITE_SERVER_BASE_URL is not configured.');
  }

  return baseUrl;
}

function parseJson<T>(rawText: string): T | null {
  try {
    return JSON.parse(rawText) as T;
  } catch {
    return null;
  }
}

function readErrorMessage(status: number, rawText: string): string {
  const payload = parseJson<ErrorEnvelope>(rawText);
  return payload?.error?.message?.trim() || rawText.trim() || `Request failed with status ${status}.`;
}

class ServerService {
  isConfigured(): boolean {
    return Boolean(getConfiguredBaseUrl());
  }

  getBaseUrl(): string {
    return getConfiguredBaseUrl();
  }

  private async request<T>(input: {
    method: 'GET' | 'POST';
    path: string;
    token?: string;
    body?: Record<string, unknown>;
  }): Promise<T> {
    const response = await CapacitorHttp.request({
      method: input.method,
      url: `${ensureBaseUrl()}${input.path}`,
      headers: {
        'Content-Type': 'application/json',
        ...(input.token?.trim() ? { Authorization: `Bearer ${input.token.trim()}` } : {}),
      },
      data: input.body,
      responseType: 'text',
      connectTimeout: 30_000,
      readTimeout: 60_000,
    });

    const rawText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? null);
    const payload = parseJson<T & ErrorEnvelope>(rawText);

    if (response.status < 200 || response.status >= 300) {
      throw new ServerError(readErrorMessage(response.status, rawText), response.status, payload?.error?.code);
    }

    if (payload == null) {
      throw new ServerError('Server response is not valid JSON.', response.status);
    }

    return payload;
  }

  async signup(username: string, password: string): Promise<AuthPayload> {
    return this.request<AuthPayload>({
      method: 'POST',
      path: '/api/v1/auth/signup',
      body: { username, password },
    });
  }

  async signin(username: string, password: string): Promise<AuthPayload> {
    return this.request<AuthPayload>({
      method: 'POST',
      path: '/api/v1/auth/signin',
      body: { username, password },
    });
  }

  async signout(token: string): Promise<void> {
    await this.request<{ ok: boolean }>({
      method: 'POST',
      path: '/api/v1/auth/signout',
      token,
      body: {},
    });
  }

  async getModels(token: string): Promise<ServerModelRecord[]> {
    const payload = await this.request<{ items: ServerModelRecord[] }>({
      method: 'GET',
      path: '/api/v1/models',
      token,
    });
    return Array.isArray(payload.items) ? payload.items : [];
  }

  async createTask(input: {
    token: string;
    clientRequestId: string;
    modelId: string;
    requestBody: Record<string, unknown>;
  }): Promise<RemoteTaskRecord> {
    const payload = await this.request<{ task: RemoteTaskRecord }>({
      method: 'POST',
      path: '/api/v1/ai/tasks',
      token: input.token,
      body: {
        client_request_id: input.clientRequestId,
        model_id: input.modelId,
        request_body: input.requestBody,
      },
    });
    return payload.task;
  }

  async getTask(token: string, taskId: string): Promise<RemoteTaskRecord> {
    const payload = await this.request<{ task: RemoteTaskRecord }>({
      method: 'GET',
      path: `/api/v1/ai/tasks/${encodeURIComponent(taskId)}`,
      token,
    });
    return payload.task;
  }

  async ackTask(token: string, taskId: string): Promise<void> {
    await this.request<{ ok: boolean }>({
      method: 'POST',
      path: `/api/v1/ai/tasks/${encodeURIComponent(taskId)}/ack`,
      token,
      body: {},
    });
  }
}

export { ServerError };
export const serverService = new ServerService();

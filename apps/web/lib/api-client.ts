export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4003/api/v1';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends RequestInit {
  body?: BodyInit | null;
  json?: unknown;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  let body = rest.body;
  if (json !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const err = payload as ApiErrorResponse | null;
    throw new ApiError(
      response.status,
      err?.error ?? `HTTP ${response.status}`,
      err?.code,
      err?.details,
    );
  }

  const success = payload as ApiSuccess<T>;
  return success.data;
}

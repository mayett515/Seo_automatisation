import { applyLocalScaffoldHeaders } from "./local-scaffold";

export const apiUrl = getApiUrl();

export function apiResourceUrl(path: string): string {
  return `${apiUrl}${path}`;
}

type JsonSchema<T> = {
  parse(input: unknown): T;
};

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  applyLocalScaffoldHeaders(headers);

  return fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers
  });
}

export async function getJson<T>(path: string, schema: JsonSchema<T>): Promise<T> {
  const response = await apiFetch(path);

  if (!response.ok) {
    throw await createApiError(response);
  }

  return schema.parse(await response.json());
}

export async function postJson<T>(path: string, body: unknown, schema: JsonSchema<T>): Promise<T> {
  const response = await apiFetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return schema.parse(await response.json());
}

export async function patchJson<T>(path: string, body: unknown, schema: JsonSchema<T>): Promise<T> {
  const response = await apiFetch(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw await createApiError(response);
  }

  return schema.parse(await response.json());
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code: string | undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function createApiError(response: Response): Promise<ApiError> {
  const { detail, code } = await readErrorBody(response);
  const message = detail
    ? `API request failed: ${response.status}. ${detail}`
    : `API request failed: ${response.status}`;

  return new ApiError(response.status, message, code);
}

type ErrorBody = {
  detail: string | undefined;
  code: string | undefined;
};

async function readErrorBody(response: Response): Promise<ErrorBody> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    if (!body || typeof body !== "object") {
      return { detail: undefined, code: undefined };
    }
    const code = "code" in body && typeof body.code === "string" ? body.code : undefined;
    const detail = parseErrorMessage(body)?.slice(0, 500);
    return { detail, code };
  }

  const text = await response
    .clone()
    .text()
    .catch(() => "");
  const detail = text.trim().slice(0, 500) || undefined;
  return { detail, code: undefined };
}

function parseErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const message = "message" in body ? body.message : undefined;
  if (typeof message === "string" && message.trim().length > 0) {
    return message.trim();
  }

  if (Array.isArray(message)) {
    return (
      message
        .filter((entry): entry is string => typeof entry === "string")
        .join("; ")
        .trim() || undefined
    );
  }

  return undefined;
}

function getApiUrl(): string {
  const env = import.meta.env;
  const configuredUrl = env ? env.VITE_API_URL : undefined;
  return typeof configuredUrl === "string" ? configuredUrl.replace(/\/$/u, "") : "/api";
}

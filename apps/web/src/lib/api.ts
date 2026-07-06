import { applyLocalScaffoldHeaders } from "./local-scaffold";

export const apiUrl = getApiUrl();

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

async function createApiError(response: Response): Promise<Error> {
  const detail = await readErrorDetail(response);
  return new Error(
    detail ? `API request failed: ${response.status}. ${detail}` : `API request failed: ${response.status}`
  );
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    const message = parseErrorMessage(body);
    return message?.slice(0, 500);
  }

  const text = await response
    .clone()
    .text()
    .catch(() => "");
  return text.trim().slice(0, 500) || undefined;
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
  const configuredUrl: unknown = import.meta.env.VITE_API_URL;
  return typeof configuredUrl === "string" ? configuredUrl : "http://localhost:4000";
}

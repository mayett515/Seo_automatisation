export const apiUrl = getApiUrl();

type JsonSchema<T> = {
  parse(input: unknown): T;
};

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include"
  });
}

export async function getJson<T>(path: string, schema: JsonSchema<T>): Promise<T> {
  const response = await apiFetch(path);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
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
    throw new Error(`API request failed: ${response.status}`);
  }

  return schema.parse(await response.json());
}

function getApiUrl(): string {
  const configuredUrl: unknown = import.meta.env.VITE_API_URL;
  return typeof configuredUrl === "string" ? configuredUrl : "http://localhost:4000";
}

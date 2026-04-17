type SupabaseFetchOptions = {
  body?: unknown;
  headers?: HeadersInit;
  method?: string;
  prefer?: string;
};

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }

  return { key, url };
}

export async function supabaseRest<T>(path: string, options: SupabaseFetchOptions = {}) {
  const { key, url } = getSupabaseConfig();
  const headers = new Headers(options.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);

  if (options.prefer) headers.set("Prefer", options.prefer);
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${url}/rest/v1/${path.replace(/^\/+/, "")}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store"
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new Error(formatSupabaseError(payload, response.statusText));
  }

  return payload as T;
}

function formatSupabaseError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;
    const message = object.message ?? object.details ?? object.hint ?? object.code;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback || "Supabase request failed.";
}

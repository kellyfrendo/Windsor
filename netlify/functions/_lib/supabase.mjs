function normalizeSupabaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) throw new Error("SUPABASE_URL is not set");
  if (/^[a-z0-9-]+$/i.test(value)) return `https://${value}.supabase.co`;
  if (!/^https?:\/\//i.test(value)) return `https://${value.replace(/^\/+/, "")}`;
  return value.replace(/\/$/, "");
}

export function getEnv() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Server sync is not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify (same values as Leftovers).");
  }
  return {
    SUPABASE_URL: normalizeSupabaseUrl(SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function supabaseRest(env, path, options = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

export async function supabaseStorage(env, path, options = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Storage request failed (${response.status}): ${text}`);
  }
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const STATE_ID = "default";
export const FILE_BUCKET = "windsor-files";

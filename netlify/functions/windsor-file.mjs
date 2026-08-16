import { FILE_BUCKET, getEnv, jsonResponse, supabaseStorage } from "./_lib/supabase.mjs";

function fileIdFrom(request, body) {
  if (body?.id) return String(body.id);
  const params = new URL(request.url).searchParams;
  return String(params.get("id") || "");
}

export default async (request) => {
  if (request.method === "OPTIONS") return jsonResponse({ ok: true });

  let env;
  try {
    env = getEnv();
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 503);
  }

  let body = {};
  if (request.method !== "GET" && request.headers.get("Content-Type")?.includes("application/json")) {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  const action = body.action || new URL(request.url).searchParams.get("action") || request.method;
  const id = fileIdFrom(request, body);
  const path = encodeURIComponent(id);

  try {
    if (action === "list" || (request.method === "GET" && !id)) {
      const listed = await supabaseStorage(env, `object/list/${FILE_BUCKET}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit: 1000 }),
      });
      const ids = Array.isArray(listed) ? listed.map((item) => item.name).filter(Boolean) : [];
      return jsonResponse({ ok: true, ids });
    }

    if (!id) return jsonResponse({ ok: false, error: "Missing file id." }, 400);

    if (action === "upload" || request.method === "POST") {
      const signed = await supabaseStorage(env, `object/upload/sign/${FILE_BUCKET}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const token = signed?.token;
      const signedPath = signed?.url || `/object/upload/sign/${FILE_BUCKET}/${id}`;
      const url = signedPath.startsWith("http")
        ? `${signedPath}${token ? `${signedPath.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : ""}`
        : `${env.SUPABASE_URL}/storage/v1${signedPath}${token ? `${signedPath.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : ""}`;
      return jsonResponse({ ok: true, url, token, contentType: body.type || "application/octet-stream" });
    }

    if (action === "download" || request.method === "GET") {
      const signed = await supabaseStorage(env, `object/sign/${FILE_BUCKET}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      });
      const signedPath = signed?.signedURL || signed?.signedUrl || signed?.url;
      if (!signedPath) return jsonResponse({ ok: false, error: "File not found." }, 404);
      const url = signedPath.startsWith("http") ? signedPath : `${env.SUPABASE_URL}/storage/v1${signedPath}`;
      return jsonResponse({ ok: true, url });
    }

    if (action === "delete" || request.method === "DELETE") {
      await supabaseStorage(env, `object/${FILE_BUCKET}/${path}`, { method: "DELETE" });
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "Unknown file action." }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "File request failed." }, 500);
  }
};

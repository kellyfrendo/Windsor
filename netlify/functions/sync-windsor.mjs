import { STATE_ID, getEnv, jsonResponse, supabaseRest } from "./_lib/supabase.mjs";

export default async (request) => {
  if (request.method === "OPTIONS") return jsonResponse({ ok: true });

  let env;
  try {
    env = getEnv();
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 503);
  }

  try {
    if (request.method === "GET") {
      const rows = await supabaseRest(
        env,
        `windsor_state?id=eq.${encodeURIComponent(STATE_ID)}&select=payload,updated_at`
      );
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      return jsonResponse({
        ok: true,
        state: row?.payload ? { ...row.payload, updatedAt: row.updated_at || row.payload.updatedAt || 0 } : null,
      });
    }

    if (request.method !== "POST" && request.method !== "PUT") {
      return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
    }

    const body = await request.json();
    const state = body?.state && typeof body.state === "object" ? body.state : body;
    if (!state || typeof state !== "object") {
      return jsonResponse({ ok: false, error: "Missing state." }, 400);
    }
    const updatedAt = Number(state.updatedAt) || Date.now();
    const row = { id: STATE_ID, payload: state, updated_at: updatedAt };
    const existing = await supabaseRest(
      env,
      `windsor_state?id=eq.${encodeURIComponent(STATE_ID)}&select=id`
    );
    if (Array.isArray(existing) && existing.length) {
      await supabaseRest(env, `windsor_state?id=eq.${encodeURIComponent(STATE_ID)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ payload: state, updated_at: updatedAt }),
      });
    } else {
      await supabaseRest(env, "windsor_state", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
    }
    return jsonResponse({ ok: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Sync failed." }, 500);
  }
};

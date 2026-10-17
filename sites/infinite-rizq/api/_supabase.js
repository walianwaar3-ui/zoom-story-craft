// Calls a Postgres function in the analytics Supabase project (IR_SUPABASE_URL / IR_SUPABASE_KEY).
export async function rpc(fn, args, timeoutMs = 8000) {
  const base = process.env.IR_SUPABASE_URL;
  const key = process.env.IR_SUPABASE_KEY;
  if (!base || !key) throw new Error('Analytics storage is not configured');
  const resp = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: resp.ok, status: resp.status, data };
}

export function parseBody(req) {
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { return null; }
  }
  return body && typeof body === 'object' ? body : null;
}

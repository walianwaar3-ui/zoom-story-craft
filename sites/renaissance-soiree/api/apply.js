// Legacy application handler: stores the form in Supabase (rs_apply RPC) so every applicant shows on the dashboard,
// even if she never sends the email draft. Env: SUPABASE_URL, SUPABASE_ANON_KEY.
const BOT = /bot|crawl|spider|preview|facebookexternalhit|headless/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  if (BOT.test(req.headers['user-agent'] || '')) return res.status(204).end();
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false });
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const p = { name: s(b.name, 120), email: s(b.email, 160), ig: s(b.ig, 60), phone: s(b.phone, 40), work: s(b.work, 200),
    ceiling: s(b.ceiling, 40), next: s(b.next, 1500), ready: s(b.ready, 60), overnight: s(b.overnight, 10), vid: s(b.vid, 40), src: s(b.src, 80) };
  try {
    const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/rs_apply', {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { console.error('rs_apply failed', r.status, (await r.text()).slice(0, 200)); return res.status(400).json({ ok: false }); }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('apply failed', err && err.message);
    return res.status(502).json({ ok: false });
  }
}

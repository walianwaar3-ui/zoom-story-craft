// Waitlist for the next Soirée: stores the opt-in in Supabase (rs_waitlist_add RPC, one row per email) so every
// name shows on the dashboard. Env: SUPABASE_URL, SUPABASE_ANON_KEY.
const BOT = /bot|crawl|spider|preview|facebookexternalhit|headless/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  if (BOT.test(req.headers['user-agent'] || '')) return res.status(204).end();
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false });
  if (b.website) return res.status(200).json({ ok: true }); // honeypot field: bots fill it, people never see it
  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const p = { name: s(b.name, 120), email: s(b.email, 160), phone: s(b.phone, 40), ig: s(b.ig, 60),
    tier: ['muse', 'icon', 'legacy', 'unsure'].includes(b.tier) ? b.tier : '', note: s(b.note, 500), vid: s(b.vid, 40), src: s(b.src, 80) };
  try {
    const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/rs_waitlist_add', {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { console.error('rs_waitlist_add failed', r.status, (await r.text()).slice(0, 200)); return res.status(400).json({ ok: false }); }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('waitlist failed', err && err.message);
    return res.status(502).json({ ok: false });
  }
}

// Dashboard data: aggregates for a date range, gated by the dashboard key (checked in the database).
import { rpc, parseBody } from './_supabase.js';

// Sales sanity metrics from the ticket sheet (Apps Script web app). Null if not configured or unreachable.
async function fetchSales() {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return null;
  try {
    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, type: 'kpis' }), signal: AbortSignal.timeout(8000),
    });
    const j = await resp.json().catch(() => null);
    return j && j.ok ? j.data : null;
  } catch (err) {
    console.error('Sheet KPIs unavailable', err);
    return null;
  }
}

function isoOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const body = parseBody(req);
  if (!body || typeof body.key !== 'string' || !body.key) return res.status(401).json({ ok: false, error: 'Access key required' });

  const sales = fetchSales();
  try {
    const r = await rpc('ir_dashboard', { p_key: body.key.slice(0, 100), p_from: isoOrNull(body.from), p_to: isoOrNull(body.to) });
    if (r.ok) {
      // Live numbers from the sheet when the Apps Script supports it, else the last saved snapshot.
      let s = await sales;
      if (s) s.source = 'live';
      else { const snap = await rpc('ir_sales', { p_key: body.key.slice(0, 100) }).catch(() => null); s = snap && snap.ok ? snap.data : null; }
      // Seat map with who holds each seat (same access key, checked in the database).
      const seats = await rpc('ir_admin_seats', { p_key: body.key.slice(0, 100) }).catch(() => null);
      return res.status(200).json({ ok: true, data: r.data, sales: s, seats: seats && seats.ok ? seats.data : null });
    }
    const msg = r.data && r.data.message;
    if (msg === 'unauthorized') return res.status(401).json({ ok: false, error: 'Wrong access key' });
    console.error('ir_dashboard failed', r.status, r.data);
    return res.status(502).json({ ok: false, error: 'Could not load analytics' });
  } catch (err) {
    console.error('ir_dashboard error', err);
    return res.status(502).json({ ok: false, error: 'Could not load analytics' });
  }
}

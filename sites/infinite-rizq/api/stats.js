// Dashboard data: aggregates for a date range, gated by the dashboard key (checked in the database).
import { rpc, parseBody } from './_supabase.js';

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

  try {
    // Staff key (ticket desk): seat map and holders only, no sales or analytics.
    const role = await rpc('ir_key_role', { p_key: body.key.slice(0, 100) });
    if (!role.ok) {
      if ((role.data && role.data.message) === 'unauthorized') return res.status(401).json({ ok: false, error: 'Wrong access key' });
      console.error('ir_key_role failed', role.status, role.data);
      return res.status(502).json({ ok: false, error: 'Could not load the dashboard' });
    }
    if (role.data === 'staff') {
      const seats = await rpc('ir_admin_seats', { p_key: body.key.slice(0, 100) }).catch(() => null);
      return res.status(200).json({ ok: true, role: 'staff', data: null, sales: null, seats: seats && seats.ok ? seats.data : null });
    }
  } catch (err) {
    console.error('ir_key_role error', err);
    return res.status(502).json({ ok: false, error: 'Could not load the dashboard' });
  }

  try {
    const r = await rpc('ir_dashboard', { p_key: body.key.slice(0, 100), p_from: isoOrNull(body.from), p_to: isoOrNull(body.to) });
    if (r.ok) {
      // Booking totals, counted live from the seat passes in the database.
      const snap = await rpc('ir_sales', { p_key: body.key.slice(0, 100) }).catch(() => null);
      const s = snap && snap.ok ? snap.data : null;
      // Seat map with who holds each seat (same access key, checked in the database).
      const seats = await rpc('ir_admin_seats', { p_key: body.key.slice(0, 100) }).catch(() => null);
      return res.status(200).json({ ok: true, role: 'owner', data: r.data, sales: s, seats: seats && seats.ok ? seats.data : null });
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

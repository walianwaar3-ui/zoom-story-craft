// "Confirm payment" button on the dashboard seat card. Runs the exact flow of choosing Paid on the sheet's
// Seat Passes tab (confirm the seat, add to Tickets, email the pass, report the Purchase to Meta), by asking the
// sheet script to do it, so phone-only approvals and sheet approvals can never drift apart.
// Gated by the dashboard access key, checked in the database.
import { rpc, parseBody } from './_supabase.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const body = parseBody(req);
  const key = body && typeof body.key === 'string' ? body.key.slice(0, 100) : '';
  const pass = body && typeof body.pass === 'string' ? body.pass.trim().slice(0, 20) : '';
  if (!key) return res.status(401).json({ ok: false, error: 'Access key required' });
  if (!/^(P|IR)-[A-Z0-9]{3,12}$/i.test(pass)) return res.status(400).json({ ok: false, error: 'Unknown pass.' });
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return res.status(503).json({ ok: false, error: 'The sheet is not connected.' });

  try {
    const s = await rpc('ir_admin_seats', { p_key: key });
    if (!s.ok) {
      if (String((s.data && s.data.message) || '') === 'unauthorized') return res.status(401).json({ ok: false, error: 'Wrong access key' });
      return res.status(502).json({ ok: false, error: 'Could not load the seat system. Try again.' });
    }
    const seat = ((s.data && s.data.seats) || []).find(x => x.pass === pass);
    if (!seat) return res.status(404).json({ ok: false, error: 'This pass has no seat, so there is nothing to confirm.' });
    if (seat.status === 'verified') return res.status(200).json({ ok: true, already: true, message: 'Already confirmed.' });

    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, type: 'approve', pass }),
      signal: AbortSignal.timeout(50000),
    });
    const r = await resp.json().catch(() => null);
    if (!r) return res.status(502).json({ ok: false, error: 'The sheet did not answer. Check the Seat Passes tab before trying again.' });
    if (!r.ok && r.error === 'unknown type') return res.status(501).json({ ok: false, error: 'The sheet script needs the Approve.gs update first.' });
    if (!r.ok) return res.status(400).json({ ok: false, error: r.error || 'The sheet could not confirm it.' });
    return res.status(200).json({ ok: true, message: r.message || 'Confirmed.' });
  } catch (err) {
    console.error('approve failed', pass, err);
    return res.status(502).json({ ok: false, error: 'Could not reach the sheet. Check the Seat Passes tab before trying again.' });
  }
}

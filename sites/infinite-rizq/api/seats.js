// Seat picker. GET ?t=<pass token> returns the hall map for that ticket; GET with no token returns the open board.
// POST with t claims for that ticket; POST with tier (open flow) matches the email to a paid ticket or holds the seat pending.
// Confirming issues the seat pass instantly and it is final. Every rule (zone per tier, pairs side by side,
// no changes once issued, no double booking) is enforced in the database functions ir_seatmap() and ir_claim_pass().
import { rpc, parseBody } from './_supabase.js';

const MESSAGES = {
  invalid: 'This seat link is not valid. Please use the link from your confirmation message.',
  locked: 'Seats are now final for the printed seating list. Message the coordinator if something is wrong.',
  final: 'Your seat pass is already issued and is final. For an urgent change, WhatsApp the coordinator with your pass number.',
  wrong_count: 'Please pick the number of seats your ticket includes.',
  wrong_zone: 'That seat is outside the zone for your ticket.',
  not_together: 'Pair Pass seats must be side by side in the same block.',
  already_chosen: 'A seat pass is already issued for this email. Seats are final; for an urgent change, WhatsApp the coordinator.',
  need_name: 'Please enter your full name.',
  need_email: 'Please enter a valid email.',
  need_phone: 'Please enter your WhatsApp number.',
  bad_tier: 'Please choose your ticket type.',
};
const TIER_NAMES = { inner: 'Inner Table', general: 'General Admission', pair: 'Pair Pass', back: 'Back Rows' };

// Best effort: the database is the record of truth, so a sheet failure never fails the seat pass.
async function sendSeatToSheet(tok) {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret || !tok) return;
  try {
    const m = await rpc('ir_seatmap', { p_token: tok });
    if (!m.ok) return console.error('seat sheet sync: could not read pass', m.status);
    const p = m.data.pass || {};
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, type: 'seat', data: {
        ticketId: p.ticket_id, tier: p.tier, seats: m.data.mine || [], name: p.name, email: p.email,
        phone: p.phone, status: p.status, issuedAt: p.issued_at,
      } }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await resp.json().catch(() => ({}));
    if (!result.ok) console.error('Sheet rejected seat pass', resp.status, result.error);
  } catch (err) {
    console.error('Failed to send seat pass to sheet', err);
  }
}

function token(v) {
  return typeof v === 'string' && /^[a-f0-9]{16,64}$/.test(v) ? v : null;
}

function failure(res, r) {
  const msg = String((r.data && r.data.message) || '');
  if (msg === 'invalid') return res.status(404).json({ ok: false, code: 'invalid', error: MESSAGES.invalid });
  if (msg.startsWith('tier_mismatch:')) {
    const t = TIER_NAMES[msg.slice(14)] || 'another';
    return res.status(400).json({ ok: false, code: 'tier_mismatch', error: `This email is registered with a ${t} ticket. Please choose ${t} above.` });
  }
  if (msg.startsWith('taken:')) {
    return res.status(409).json({ ok: false, code: 'taken', taken: msg.slice(6).split(','), error: 'Someone just took that seat. Please pick another.' });
  }
  if (MESSAGES[msg]) return res.status(400).json({ ok: false, code: msg, error: MESSAGES[msg] });
  console.error('seat rpc failed', r.status, r.data);
  return res.status(502).json({ ok: false, error: 'Could not reach the seat map. Please try again.' });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const raw = req.query && req.query.t;
      if (!raw) {
        const b = await rpc('ir_seat_board', {});
        return b.ok ? res.status(200).json({ ok: true, data: b.data }) : failure(res, b);
      }
      const t = token(raw);
      if (!t) return res.status(404).json({ ok: false, code: 'invalid', error: MESSAGES.invalid });
      const r = await rpc('ir_seatmap', { p_token: t });
      return r.ok ? res.status(200).json({ ok: true, data: r.data }) : failure(res, r);
    }
    if (req.method === 'POST') {
      const body = parseBody(req);
      if (!body) return res.status(400).json({ ok: false, error: 'Bad request' });
      const t = body.t ? token(body.t) : null;
      if (body.t && !t) return res.status(404).json({ ok: false, code: 'invalid', error: MESSAGES.invalid });
      const seats = Array.isArray(body.seats) ? body.seats.filter(s => typeof s === 'string' && /^[A-I]-\d{2}$/.test(s)).slice(0, 2) : [];
      const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const email = str(body.email, 160);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email.' });
      const r = t
        ? await rpc('ir_claim_pass', { p_token: t, p_seats: seats, p_name: str(body.name, 120), p_email: email, p_phone: str(body.phone, 40) })
        // Open flow: anyone picks their ticket type; the email links them to a paid ticket, or the seat is held pending verification.
        : await rpc('ir_claim_open', { p_tier: str(body.tier, 10), p_seats: seats, p_name: str(body.name, 120), p_email: email, p_phone: str(body.phone, 40) });
      if (!r.ok) return failure(res, r);
      await sendSeatToSheet(t || (r.data && r.data.token));
      return res.status(200).json({ ok: true, data: r.data });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('seat api error', err);
    return res.status(502).json({ ok: false, error: 'Could not reach the seat map. Please try again.' });
  }
}

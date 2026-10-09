// Seat picker: GET ?t=<pass token> returns the hall map for that ticket; POST claims the chosen seat(s).
// Every rule (zone per tier, pairs side by side, one change, no double booking) is enforced in
// the database functions ir_seatmap() and ir_claim_seats().
import { rpc, parseBody } from './_supabase.js';

const MESSAGES = {
  invalid: 'This seat link is not valid. Please use the link from your confirmation message.',
  locked: 'Seats are now final for the printed seating list. Message the coordinator if something is wrong.',
  no_more_changes: 'You have already used your one seat change. Message the coordinator if you need help.',
  wrong_count: 'Please pick the number of seats your ticket includes.',
  wrong_zone: 'That seat is outside the zone for your ticket.',
  not_together: 'Pair Pass seats must be side by side in the same block.',
};

function token(v) {
  return typeof v === 'string' && /^[a-f0-9]{16,64}$/.test(v) ? v : null;
}

function failure(res, r) {
  const msg = String((r.data && r.data.message) || '');
  if (msg === 'invalid') return res.status(404).json({ ok: false, code: 'invalid', error: MESSAGES.invalid });
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
      const t = token(req.query && req.query.t);
      if (!t) return res.status(404).json({ ok: false, code: 'invalid', error: MESSAGES.invalid });
      const r = await rpc('ir_seatmap', { p_token: t });
      return r.ok ? res.status(200).json({ ok: true, data: r.data }) : failure(res, r);
    }
    if (req.method === 'POST') {
      const body = parseBody(req);
      const t = body && token(body.t);
      if (!t) return res.status(404).json({ ok: false, code: 'invalid', error: MESSAGES.invalid });
      const seats = Array.isArray(body.seats) ? body.seats.filter(s => typeof s === 'string' && /^[A-I]-\d{2}$/.test(s)).slice(0, 2) : [];
      const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const email = str(body.email, 160);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Please enter a valid email.' });
      const r = await rpc('ir_claim_seats', { p_token: t, p_seats: seats, p_name: str(body.name, 120), p_email: email });
      return r.ok ? res.status(200).json({ ok: true, data: r.data }) : failure(res, r);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('seat api error', err);
    return res.status(502).json({ ok: false, error: 'Could not reach the seat map. Please try again.' });
  }
}

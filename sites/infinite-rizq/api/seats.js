// Seat picker. GET ?t=<pass token> returns the hall map for that ticket; GET with no token returns the open board.
// POST with t claims for that ticket; POST with tier (open flow) matches the email to a paid ticket or holds the seat pending.
// Confirming issues the seat pass instantly and it is final. Every rule (zone per tier, pairs side by side,
// no changes once issued, no double booking) is enforced in the database functions ir_seatmap() and ir_claim_pass().
import { rpc, parseBody } from './_supabase.js';
import { purchaseEvent, sendEvents } from './_meta.js';

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
  need_section: 'Please choose the Sisters or Brothers section first.',
  wrong_section: 'That seat is outside your section. Sisters sit on the left half, Brothers on the right half.',
  paid_locked: 'Not released: this person is Paid, so their seat is protected. Ask Claude or the coordinator to move or cancel a paid seat.',
  no_seat: 'Not confirmed: this person has no seat yet. Ask them to pick one at infiniterizq.com/my-seat, then choose Paid again.',
  not_found: 'We could not find a seat pass for that name and email. Use the email you paid with, or WhatsApp the coordinator.',
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
        phone: p.phone, status: p.status, issuedAt: p.issued_at, section: p.section,
      } }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await resp.json().catch(() => ({}));
    if (!result.ok) console.error('Sheet rejected seat pass', resp.status, result.error);
  } catch (err) {
    console.error('Failed to send seat pass to sheet', err);
  }
}

// Paid on the sheet = real money confirmed, so this is where Meta hears about the Purchase (once per ticket).
// ir_capi_mark claims the send atomically, so a second Paid on the same row never reports twice.
async function sendPurchase(secret, pass) {
  try {
    const m = await rpc('ir_capi_mark', { p_secret: secret, p_ticket: pass.ticket_id });
    if (!m.ok || m.data !== true) return;
    const r = await sendEvents([purchaseEvent(pass)]);
    if (!r.ok) {
      console.error('Meta CAPI rejected purchase', pass.ticket_id, r.status, JSON.stringify(r.data));
      await rpc('ir_capi_unmark', { p_secret: secret, p_ticket: pass.ticket_id });
    }
  } catch (err) {
    console.error('Meta CAPI send failed', pass.ticket_id, err);
  }
}

// The buyer's Meta browser ids (cookies) plus IP and device, kept with the pass so the later Purchase matches their ad click.
async function savePassMeta(tok, req, body) {
  if (!tok) return;
  const fb = v => (typeof v === 'string' && /^fb\.\d\.\d+\.[\w.-]{1,200}$/.test(v) ? v : undefined);
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined;
  const ua = String(req.headers['user-agent'] || '').slice(0, 400) || undefined;
  try {
    await rpc('ir_pass_meta', { p_token: tok, p_meta: { fbp: fb(body.fbp), fbc: fb(body.fbc), ip, ua } });
  } catch (err) {
    console.error('Could not save pass meta', err);
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
      // Coordinator action from the sheet (Seat Passes tab): confirm payment or release a held seat.
      // The database checks the sheet secret; a wrong secret is refused there.
      if (body.admin) {
        const a = await rpc('ir_admin_pass', { p_secret: str(body.secret, 200), p_ticket: str(body.ticketId, 20), p_action: str(body.admin, 10), p_ref: str(body.ref, 20) });
        if (!a.ok && String((a.data && a.data.message) || '') === 'unauthorized') return res.status(401).json({ ok: false, error: 'unauthorized' });
        if (a.ok && body.admin === 'verify' && a.data && a.data.status === 'verified' && !a.data.capi_sent_at) await sendPurchase(str(body.secret, 200), a.data);
        return a.ok ? res.status(200).json({ ok: true, data: a.data }) : failure(res, a);
      }
      // Find my seat: email plus a word of the name on the ticket returns that ticket's private pass link.
      if (body.find) {
        const f = await rpc('ir_find_pass', { p_email: email, p_name: str(body.name, 120) });
        return f.ok ? res.status(200).json({ ok: true, data: { token: f.data.token, hasSeat: f.data.has_seat } }) : failure(res, f);
      }
      // Sisters sit on the left half of the hall, Brothers on the right; the database checks every seat against the section.
      const section = body.section === 'sisters' || body.section === 'brothers' ? body.section : '';
      const r = t
        ? await rpc('ir_claim_seat', { p_token: t, p_seats: seats, p_name: str(body.name, 120), p_email: email, p_phone: str(body.phone, 40), p_section: section })
        // Open flow: anyone picks their ticket type; the email links them to a paid ticket, or the seat is held pending verification.
        : await rpc('ir_claim_open_seat', { p_tier: str(body.tier, 10), p_seats: seats, p_name: str(body.name, 120), p_email: email, p_phone: str(body.phone, 40), p_section: section });
      if (!r.ok) return failure(res, r);
      await Promise.all([sendSeatToSheet(t || (r.data && r.data.token)), savePassMeta(t || (r.data && r.data.token), req, body)]);
      return res.status(200).json({ ok: true, data: r.data });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('seat api error', err);
    return res.status(502).json({ ok: false, error: 'Could not reach the seat map. Please try again.' });
  }
}

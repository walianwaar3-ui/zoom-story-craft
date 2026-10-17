// "Ask" box on the dashboard: a question in plain language, answered by Claude from the live data
// (ticket sheet, seat system, site analytics). Gated by the same dashboard access key as /api/stats.
// Read only: Claude sees a snapshot of the data and can't change anything.
import Anthropic from '@anthropic-ai/sdk';
import { rpc, parseBody } from './_supabase.js';

export const config = { maxDuration: 60 };

let client = null; // created on first use, so a missing ANTHROPIC_API_KEY gives a clear message instead of a crash

async function sheet(type) {
  const url = process.env.SHEET_WEBHOOK_URL, secret = process.env.SHEET_WEBHOOK_SECRET;
  if (!url || !secret) return null;
  try {
    const resp = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, type }), signal: AbortSignal.timeout(10000),
    });
    const j = await resp.json().catch(() => null);
    return j && j.ok ? j.data : null;
  } catch (err) {
    console.error('ask: sheet ' + type + ' unavailable', err);
    return null;
  }
}

const SYSTEM = `You answer questions for the organiser of Infinite Rizq, a live event by WWO (Wali Anwaar) with Shahrez Hayder:
Saturday 17 October 2026, 10 AM to 4:30 PM, Grand Ballroom D, Nishat Hotel, Johar Town, Lahore (moved from Expo Center on demand). Tea and snacks for every guest; Inner Table guests have a separate buffet. Nobody picks seats: buyers choose their ticket and section, the team allocates every seat, and the exact seat is given on arrival. The hall holds 192 seats in 12 rows (A to L): row A has 16 VIP sofas (8 sisters, 8 brothers), rows B to L have 16 seats each (8 per side), centre aisle, seats 1-8 Sisters and 9-16 Brothers. Row A = Inner Table (16 sofas), Rows B-D = Pair Pass, Rows E-F = General, Row G = held, Rows H-K = Main Hall (tier "back", PKR 5,555; publicly described only as "the back rows", never with row numbers), Row L = student row (zone "student", Student Pair Pass only; students register on /student-ticket). Student Pair Pass (tier "student", PKR 5,500 for 2 students, from /students or /seats) sits in the student row L, side by side, seats allocated by the team; both must show a valid student card at the door or the student pass is cancelled. AVAILABILITY: the Inner Table is sold out for brothers (one sister seat may remain). Pair Pass, General and Main Hall have seats on both sides.  Zone "held" = row G (16 seats) privately held for family and team; never mention them publicly. Rows M-T no longer exist (any leftover M-T seats are closed, zone held).

Ticket types: Inner Table PKR 33,333 (Row A, sofas), Pair Pass PKR 15,555 for two seats (Rows B-D), General Admission PKR 11,111 (Rows E-F),
Main Hall PKR 5,555 (Rows H-K; stored as tier "back", formerly Back Rows; earlier buyers paid 5,500). Sisters sit left of the centre aisle
(seats 1 to 8 of every row), Brothers right (seats 9 to 16). Seat ids are placeholders; real seats are given on arrival.

You get a JSON snapshot with up to four parts:
- tickets: every row of the "Tickets" tab of the Google Sheet (the sales record). "Payment Verified" = Yes means paid.
  "Ticket Issued" = Yes means the ticket was sent. "Checked In" is for the event day.
- sales: totals the dashboard shows, computed from the same tab (pending = Payment Verified blank; notIssued = paid but Ticket Issued is not Yes).
- seats: the live seat system. Each seat has who holds it (name, email, phone, pass id, ticket type, status: verified = paid,
  pending = held but payment not confirmed). "unseated" lists paid passes with no seat yet. A pass's ticket_ref links it to an IR- ticket id.
- analytics: website traffic and funnel numbers for all time.

How to answer:
- Answer from the snapshot only. If the data needed is not there, say exactly what is missing; never guess or invent names or numbers.
- Lead with the direct answer, then the list. When the answer is about people, list them with ticket id, name, ticket type and the
  relevant detail (seat, phone or amount), one per line. Count carefully and make sure the count matches the list.
- Money in PKR with thousands separators. Keep it short and plain; the reader is busy and not technical.
- If something in the data looks inconsistent (a paid ticket with no seat, a duplicate, an amount that does not match the ticket type),
  point it out briefly at the end.`;

function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  return h.slice(-8)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const body = parseBody(req);
  const key = body && typeof body.key === 'string' ? body.key.slice(0, 100) : '';
  const question = body && typeof body.question === 'string' ? body.question.trim().slice(0, 1000) : '';
  if (!key) return res.status(401).json({ ok: false, error: 'Access key required' });
  if (!question) return res.status(400).json({ ok: false, error: 'Type a question first.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ ok: false, error: 'The assistant is not set up yet: add ANTHROPIC_API_KEY in Vercel.' });

  // Staff keys (ticket desk) cannot use this.
  const who = await rpc('ir_key_role', { p_key: key }).catch(() => null);
  if (!who || !who.ok) {
    const bad = who && who.data && who.data.message === 'unauthorized';
    return res.status(bad ? 401 : 502).json({ ok: false, error: bad ? 'Wrong access key' : 'Try again.' });
  }
  if (who.data !== 'owner') return res.status(403).json({ ok: false, error: 'The Ask box is for the founder only.' });

  try {
    const [seats, analytics, sales, tickets] = await Promise.all([
      rpc('ir_admin_seats', { p_key: key }),
      rpc('ir_dashboard', { p_key: key, p_from: null, p_to: null }).catch(() => null),
      sheet('kpis'),
      sheet('tickets'),
    ]);
    // The seat call checks the access key in the database; nothing is sent to Claude without it.
    if (!seats.ok) {
      if (String((seats.data && seats.data.message) || '') === 'unauthorized') return res.status(401).json({ ok: false, error: 'Wrong access key' });
      console.error('ask: ir_admin_seats failed', seats.status, seats.data);
      return res.status(502).json({ ok: false, error: 'Could not load the data. Try again.' });
    }
    const snapshot = {
      now: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi' }) + ' (Pakistan time)',
      tickets: tickets || 'not available (the sheet script does not send ticket rows yet)',
      sales: sales || 'not available',
      seats: seats.data,
      analytics: analytics && analytics.ok ? analytics.data : 'not available',
    };

    client = client || new Anthropic(); // ANTHROPIC_API_KEY from the Vercel project
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        ...cleanHistory(body.history),
        { role: 'user', content: 'DATA SNAPSHOT:\n' + JSON.stringify(snapshot) + '\n\nQUESTION: ' + question },
      ],
    });
    if (response.stop_reason === 'refusal') return res.status(200).json({ ok: true, answer: 'I can’t answer that one. Try asking it a different way.' });
    const answer = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return res.status(200).json({ ok: true, answer: answer || 'No answer came back. Try again.', partial: response.stop_reason === 'max_tokens' });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('ask: bad ANTHROPIC_API_KEY');
      return res.status(503).json({ ok: false, error: 'The assistant’s API key is not valid. Check ANTHROPIC_API_KEY in Vercel.' });
    }
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ ok: false, error: 'Too many questions at once. Wait a moment and ask again.' });
    console.error('ask failed', err);
    return res.status(502).json({ ok: false, error: 'The assistant could not answer. Try again.' });
  }
}

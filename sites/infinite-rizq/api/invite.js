// University speaker-invite applications for Shahrez Hayder → ir_invites via the ir_invite_apply RPC.
import { rpc, parseBody } from './_supabase.js';

const MESSAGES = {
  need_name: 'Please enter your full name.',
  need_email: 'Please enter a valid email.',
  need_phone: 'Please enter your WhatsApp number.',
  need_university: 'Please enter your university.',
  need_city: 'Please enter your city.',
  need_role: 'Please choose your role.',
  need_audience: 'Please choose the expected audience size.',
  need_timing: 'Please choose when you would like the session.',
  need_approval: 'Please tell us where the university approval stands.',
  need_support: 'Please tell us what the university can provide.',
  need_why: 'Please tell us a little more about why your students need this (at least a sentence).',
};

function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const body = parseBody(req);
  if (!body) return res.status(400).json({ ok: false, error: 'Invalid request' });
  if (clean(body.website, 200)) return res.status(200).json({ ok: true, qualified: false }); // honeypot

  const topics = Array.isArray(body.topics) ? body.topics.map(t => clean(t, 80)).filter(Boolean).slice(0, 10) : [];
  const p = {
    name: clean(body.name, 120), role: clean(body.role, 20), university: clean(body.university, 160),
    city: clean(body.city, 80), society: clean(body.society, 160), email: clean(body.email, 160),
    phone: clean(body.phone, 40), audience: clean(body.audience, 20), timing: clean(body.timing, 20),
    approval: clean(body.approval, 20), support: clean(body.support, 20), topics, why: clean(body.why, 2000),
    meta: { src: clean(body.src, 80), ua: clean(req.headers['user-agent'], 300), at: new Date().toISOString() },
  };
  try {
    const r = await rpc('ir_invite_apply', { p });
    const d = r.data || {};
    if (!r.ok) return res.status(502).json({ ok: false, error: 'Could not send right now. Please try again.' });
    if (!d.ok) return res.status(400).json({ ok: false, code: d.code, error: MESSAGES[d.code] || 'Please check your details.' });
    return res.status(200).json({ ok: true, qualified: !!d.qualified });
  } catch {
    return res.status(502).json({ ok: false, error: 'Could not send right now. Please try again.' });
  }
}

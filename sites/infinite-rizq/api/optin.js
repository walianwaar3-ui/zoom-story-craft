// Opt-in list (e.g. UET): name, email, WhatsApp → ir_optins via the ir_optin RPC.
import { rpc, parseBody } from './_supabase.js';

const MESSAGES = {
  need_name: 'Please enter your full name.',
  need_email: 'Please enter a valid email.',
  need_phone: 'Please enter your WhatsApp number.',
};

function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const body = parseBody(req);
  if (!body) return res.status(400).json({ ok: false, error: 'Invalid request' });
  if (clean(body.website, 200)) return res.status(200).json({ ok: true }); // honeypot

  const list = clean(body.list, 40).toLowerCase() || 'uet';
  if (!/^[a-z0-9-]+$/.test(list)) return res.status(400).json({ ok: false, error: 'Invalid list' });
  const meta = {
    src: clean(body.src, 80),
    ua: clean(req.headers['user-agent'], 300),
    at: new Date().toISOString(),
  };
  try {
    const r = await rpc('ir_optin', {
      p_list: list,
      p_name: clean(body.name, 120),
      p_email: clean(body.email, 160),
      p_phone: clean(body.phone, 40),
      p_meta: meta,
    });
    const d = r.data || {};
    if (!r.ok) return res.status(502).json({ ok: false, error: 'Could not save right now. Please try again.' });
    if (!d.ok) return res.status(400).json({ ok: false, code: d.code, error: MESSAGES[d.code] || 'Please check your details.' });
    return res.status(200).json({ ok: true, new: d.new });
  } catch {
    return res.status(502).json({ ok: false, error: 'Could not save right now. Please try again.' });
  }
}

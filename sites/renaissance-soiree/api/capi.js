// Meta Conversions API relay: the pages send each pixel event here with the same event ID, and we forward it
// server-side so Meta can deduplicate. The access token lives only in the META_CAPI_TOKEN environment variable.
import crypto from 'node:crypto';

const PIXEL_ID = '1874556003533048';
const ALLOWED = new Set(['PageView', 'ViewContent', 'InitiateCheckout', 'Lead', 'Contact', 'SubmitApplication', 'Purchase', 'CompleteRegistration']);

function cookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return res.status(204).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !ALLOWED.has(body.event_name) || typeof body.event_id !== 'string') return res.status(400).json({ ok: false });

  const d = body.data && typeof body.data === 'object' ? body.data : {};
  const custom = {};
  if (typeof d.value === 'number' && d.value >= 0 && d.value < 100000) { custom.value = d.value; custom.currency = 'USD'; }
  if (typeof d.content_name === 'string') custom.content_name = d.content_name.slice(0, 100);
  if (typeof d.content_category === 'string') custom.content_category = d.content_category.slice(0, 50);

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined;
  const event = {
    event_name: body.event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.event_id.slice(0, 100),
    action_source: 'website',
    event_source_url: typeof body.url === 'string' ? body.url.slice(0, 500) : undefined,
    user_data: {
      client_ip_address: ip,
      client_user_agent: req.headers['user-agent'],
      fbp: cookie(req, '_fbp'),
      fbc: cookie(req, '_fbc'),
      external_id: ip ? crypto.createHash('sha256').update(ip + (req.headers['user-agent'] || '')).digest('hex') : undefined,
    },
    custom_data: custom,
  };
  const payload = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error('CAPI error', r.status, (await r.text()).slice(0, 300));
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (err) {
    console.error('CAPI request failed', err && err.message);
    return res.status(502).json({ ok: false });
  }
}

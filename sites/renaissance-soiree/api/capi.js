// Event relay for the Soirée pages. Every event is stored for the dashboard (Supabase rs_track), and the standard ones
// are forwarded to the Meta Conversions API with the pixel's event ID so Meta can deduplicate.
// Secrets live only in environment variables: META_CAPI_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.
import crypto from 'node:crypto';

const PIXEL_ID = '1874556003533048';
const META_EVENTS = new Set(['PageView', 'ViewContent', 'InitiateCheckout', 'Lead', 'Contact', 'SubmitApplication', 'Purchase', 'CompleteRegistration']);
const INTERNAL_EVENTS = new Set(['Scroll50', 'ViewTiers', 'VideoPlay', 'Video50', 'VideoEnd']); // dashboard only, never sent to Meta

function cookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}
function deviceOf(ua) {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|vercel/i;
const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);

async function store(row) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return;
  try {
    const r = await fetch(url + '/rest/v1/rpc/rs_track', {
      method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: row }), signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) console.error('rs_track failed', r.status, (await r.text()).slice(0, 200));
  } catch (err) { console.error('rs_track error', err && err.message); }
}

async function forward(req, body, custom, ip) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return true;
  const event = {
    event_name: body.event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.event_id.slice(0, 100),
    action_source: 'website',
    event_source_url: str(body.url, 500),
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
    return r.ok;
  } catch (err) {
    console.error('CAPI request failed', err && err.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const name = body && body.event_name;
  if (!body || !(META_EVENTS.has(name) || INTERNAL_EVENTS.has(name)) || typeof body.event_id !== 'string') return res.status(400).json({ ok: false });
  const ua = String(req.headers['user-agent'] || '');
  if (BOT.test(ua)) return res.status(204).end();

  const d = body.data && typeof body.data === 'object' ? body.data : {};
  const custom = {};
  if (typeof d.value === 'number' && d.value >= 0 && d.value < 100000) { custom.value = d.value; custom.currency = 'USD'; }
  if (typeof d.content_name === 'string') custom.content_name = d.content_name.slice(0, 100);
  if (typeof d.content_category === 'string') custom.content_category = d.content_category.slice(0, 50);

  let path = '/';
  try { path = new URL(body.url).pathname.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '') || '/'; } catch {}
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined;
  const t = body.touch && typeof body.touch === 'object' ? body.touch : {};

  const jobs = [store({
    event: name, event_id: body.event_id.slice(0, 100),
    vid: str(body.vid, 60) || cookie(req, '_fbp') || (ip ? crypto.createHash('sha256').update(ip + ua).digest('hex').slice(0, 24) : undefined),
    src: str(t.src, 60), source: str(t.source, 60), path, label: custom.content_name,
    value: custom.value != null ? String(custom.value) : undefined, device: deviceOf(ua),
  })];
  // internal: true = dashboard only (e.g. the welcome-page Purchase, which Stan's own pixel already reports to Meta).
  if (META_EVENTS.has(name) && body.internal !== true) jobs.push(forward(req, body, custom, ip));
  const results = await Promise.all(jobs);
  return res.status(results[1] === false ? 502 : 200).json({ ok: true });
}

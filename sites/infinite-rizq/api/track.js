// First-party analytics collector: the landing and thank-you pages beacon batches of events here,
// we add device + country, drop bots, and store them via the ir_track() function.
import { rpc, parseBody } from './_supabase.js';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom|vercel/i;

function deviceOf(ua) {
  if (/ipad|tablet/i.test(ua)) return 'tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function referrerHost(ref) {
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    return /(^|\.)infiniterizq\.com$|stripe\.com$|vercel\.app$/.test(host) ? '' : host;
  } catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const body = parseBody(req);
  if (!body) return res.status(400).end();

  const ua = String(req.headers['user-agent'] || '');
  if (BOT.test(ua)) return res.status(204).end();

  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const payload = {
    campaign: str(body.campaign, 60),
    page: str(body.page, 40),
    vid: str(body.vid, 64),
    sid: str(body.sid, 64),
    device: deviceOf(ua),
    country: str(req.headers['x-vercel-ip-country'], 8),
    referrer: referrerHost(str(body.ref, 500)),
    utm_source: str(body.us, 60),
    utm_medium: str(body.um, 60),
    utm_campaign: str(body.uc, 80),
    events: Array.isArray(body.events) ? body.events.slice(0, 30) : [],
  };

  try {
    const r = await rpc('ir_track', { p: payload }, 5000);
    if (!r.ok) console.error('ir_track rejected', r.status, r.data);
  } catch (err) {
    console.error('ir_track failed', err);
  }
  return res.status(204).end();
}

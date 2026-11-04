// Dashboard data: the funnel from Supabase (rs_dashboard, gated by the dashboard key) plus live spend from the Meta campaign.
// Also logs "We tried this" fixes. Env: SUPABASE_URL, SUPABASE_ANON_KEY, META_ADS_TOKEN, META_CAMPAIGN_ID.
const RANGES = { '24h': 1, '3d': 3, '7d': 7, all: null };
const AD_SRC = { A: 'tickets', B: 'decision', C: 'singleday' };

async function rpc(fn, args) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(8000),
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, data };
}

function sumActions(list, types) {
  return (list || []).filter(a => types.includes(a.action_type)).reduce((n, a) => n + Number(a.value || 0), 0);
}

async function meta(sinceDays, device) {
  const token = process.env.META_ADS_TOKEN, campaign = process.env.META_CAMPAIGN_ID;
  if (!token || !campaign) return null;
  const params = new URLSearchParams({
    access_token: token,
    fields: 'ad_name,adset_name,spend,impressions,reach,frequency,inline_link_clicks,actions,action_values',
    level: 'ad', limit: '100',
  });
  if (sinceDays) {
    const until = new Date(), since = new Date(Date.now() - sinceDays * 864e5);
    const f = d => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    params.set('time_range', JSON.stringify({ since: f(since), until: f(until) }));
  } else params.set('date_preset', 'maximum');
  if (device) params.set('breakdowns', 'impression_device');
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${campaign}/insights?${params}`, { signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    if (!r.ok) { console.error('Meta insights error', JSON.stringify(j.error || j).slice(0, 300)); return { error: true }; }
    let rows = j.data || [];
    if (device) rows = rows.filter(x => device === 'mobile' ? /iphone|ipod|android_smartphone/.test(x.impression_device) : device === 'desktop' ? x.impression_device === 'desktop' : /ipad|android_tablet/.test(x.impression_device));
    const ads = rows.map(x => ({
      ad: x.ad_name, adset: x.adset_name, src: AD_SRC[(x.ad_name || '').match(/Soirée ([ABC])/)?.[1]] || '',
      spend: Number(x.spend || 0), impressions: Number(x.impressions || 0), reach: Number(x.reach || 0),
      linkClicks: Number(x.inline_link_clicks || 0),
      landingViews: sumActions(x.actions, ['landing_page_view']),
      purchases: sumActions(x.actions, ['offsite_conversion.fb_pixel_purchase', 'purchase']),
      purchaseValue: sumActions(x.action_values, ['offsite_conversion.fb_pixel_purchase', 'purchase']),
    }));
    const tot = ads.reduce((t, a) => { for (const k of ['spend', 'impressions', 'linkClicks', 'landingViews', 'purchases', 'purchaseValue']) t[k] += a[k]; return t; },
      { spend: 0, impressions: 0, linkClicks: 0, landingViews: 0, purchases: 0, purchaseValue: 0 });
    return { ads, totals: tot };
  } catch (err) {
    console.error('Meta insights failed', err && err.message);
    return { error: true };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b.key !== 'string' || !b.key) return res.status(401).json({ ok: false, error: 'Access key required' });
  const key = b.key.slice(0, 100);

  if (b.fix && typeof b.fix.step === 'string') {
    const r = await rpc('rs_fix_add', { p_key: key, p_step: b.fix.step, p_note: String(b.fix.note || '').slice(0, 300) });
    if (!r.ok) return res.status(r.data && r.data.message === 'unauthorized' ? 401 : 502).json({ ok: false, error: 'Could not save' });
    return res.status(200).json({ ok: true, fix: r.data });
  }

  const days = RANGES.hasOwnProperty(b.range) ? RANGES[b.range] : 7;
  const device = ['mobile', 'desktop', 'tablet'].includes(b.device) ? b.device : null;
  const traffic = ['meta', 'other'].includes(b.traffic) ? b.traffic : null;
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : null;
  const [f, m] = await Promise.all([
    rpc('rs_dashboard', { p_key: key, p_since: since, p_device: device, p_traffic: traffic }),
    traffic === 'other' ? Promise.resolve(null) : meta(days, device),
  ]);
  if (!f.ok) {
    if (f.data && f.data.message === 'unauthorized') return res.status(401).json({ ok: false, error: 'Wrong access key' });
    console.error('rs_dashboard failed', JSON.stringify(f.data).slice(0, 300));
    return res.status(502).json({ ok: false, error: 'Could not load the funnel' });
  }
  return res.status(200).json({ ok: true, funnel: f.data, meta: m });
}

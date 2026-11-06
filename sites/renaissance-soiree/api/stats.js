// Dashboard data: the funnel from Supabase (rs_dashboard, gated by the dashboard key) plus live spend from every campaign in the Meta ad account.
// Also logs "We tried this" fixes. Env: SUPABASE_URL, SUPABASE_ANON_KEY, META_ADS_TOKEN, META_CAMPAIGN_ID (ours, listed first), META_AD_ACCOUNT (optional).
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

// Every campaign in the ad account counts (ours plus the ones built in the other tool). Each ad is matched to the
// page's traffic by the utm_content in its link, so Meta spend sits next to what those visitors did on the page.
const ACCOUNT = process.env.META_AD_ACCOUNT || 'act_1124506973279138';
let linkCache = { at: 0, map: {} };
async function adLinks(token) {
  if (Date.now() - linkCache.at < 10 * 60e3) return linkCache.map;
  const map = {};
  let url = `https://graph.facebook.com/v21.0/${ACCOUNT}/ads?` + new URLSearchParams({ access_token: token, fields: 'id,creative{url_tags,object_story_spec,asset_feed_spec{link_urls}}', limit: '200' });
  for (let i = 0; url && i < 5; i++) {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
    const j = await r.json();
    if (!r.ok) { console.error('Meta ads error', JSON.stringify(j.error || j).slice(0, 300)); break; }
    for (const a of j.data || []) {
      const c = a.creative || {}, o = c.object_story_spec || {}, ld = o.link_data || {}, vd = o.video_data || {};
      const link = ld.link || (vd.call_to_action && vd.call_to_action.value && vd.call_to_action.value.link) || ((c.asset_feed_spec && c.asset_feed_spec.link_urls) || [])[0]?.website_url || '';
      let q = new URLSearchParams();
      try { q = new URL(link).searchParams; } catch {}
      if (c.url_tags) for (const [k, v] of new URLSearchParams(c.url_tags)) if (!q.get(k)) q.set(k, v);
      map[a.id] = { content: q.get('utm_content') || q.get('src') || '', campaign: q.get('utm_campaign') || '' };
    }
    url = j.paging && j.paging.next;
  }
  linkCache = { at: Date.now(), map };
  return map;
}

async function meta(sinceDays, device) {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return null;
  const params = new URLSearchParams({
    access_token: token,
    fields: 'campaign_id,campaign_name,ad_id,ad_name,adset_name,spend,impressions,reach,frequency,inline_link_clicks,actions,action_values',
    level: 'ad', limit: '500',
  });
  if (sinceDays) {
    const until = new Date(), since = new Date(Date.now() - sinceDays * 864e5);
    const f = d => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    params.set('time_range', JSON.stringify({ since: f(since), until: f(until) }));
  } else params.set('date_preset', 'maximum');
  if (device) params.set('breakdowns', 'impression_device');
  try {
    const [r, links] = await Promise.all([
      fetch(`https://graph.facebook.com/v21.0/${ACCOUNT}/insights?${params}`, { signal: AbortSignal.timeout(9000) }),
      adLinks(token).catch(() => ({})),
    ]);
    const j = await r.json();
    if (!r.ok) { console.error('Meta insights error', JSON.stringify(j.error || j).slice(0, 300)); return { error: true }; }
    let rows = j.data || [];
    if (device) rows = rows.filter(x => device === 'mobile' ? /iphone|ipod|android_smartphone/.test(x.impression_device) : device === 'desktop' ? x.impression_device === 'desktop' : /ipad|android_tablet/.test(x.impression_device));
    const ours = process.env.META_CAMPAIGN_ID;
    const ads = rows.map(x => {
      const l = links[x.ad_id] || {};
      return {
        ad: x.ad_name, adset: x.adset_name, campaign: x.campaign_name, campaignId: x.campaign_id, ours: x.campaign_id === ours,
        src: l.content || AD_SRC[(x.ad_name || '').match(/Soirée ([ABC])/)?.[1]] || '',
        spend: Number(x.spend || 0), impressions: Number(x.impressions || 0), reach: Number(x.reach || 0),
        linkClicks: Number(x.inline_link_clicks || 0),
        landingViews: sumActions(x.actions, ['landing_page_view']),
        purchases: sumActions(x.actions, ['offsite_conversion.fb_pixel_purchase', 'purchase']),
        purchaseValue: sumActions(x.action_values, ['offsite_conversion.fb_pixel_purchase', 'purchase']),
      };
    });
    const K = ['spend', 'impressions', 'linkClicks', 'landingViews', 'purchases', 'purchaseValue'];
    const zero = () => ({ spend: 0, impressions: 0, linkClicks: 0, landingViews: 0, purchases: 0, purchaseValue: 0 });
    const tot = zero(), camps = {};
    for (const a of ads) {
      const c = camps[a.campaignId] = camps[a.campaignId] || Object.assign({ id: a.campaignId, name: a.campaign, ours: a.ours, srcs: [] }, zero());
      for (const k of K) { tot[k] += a[k]; c[k] += a[k]; }
      if (a.src && !c.srcs.includes(a.src)) c.srcs.push(a.src);
    }
    const campaigns = Object.values(camps).sort((a, b) => (b.ours - a.ours) || (b.spend - a.spend));
    return { ads, totals: tot, campaigns };
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

  if (b.stan && typeof b.stan.tier === 'string') {
    const qty = Math.max(0, Math.min(999, parseInt(b.stan.qty, 10) || 0)), rev = Math.max(0, Math.min(1e6, Number(b.stan.revenue) || 0));
    const r = await rpc('rs_stan_set', { p_key: key, p_tier: b.stan.tier, p_qty: qty, p_revenue: rev });
    if (!r.ok) return res.status(r.data && r.data.message === 'unauthorized' ? 401 : 502).json({ ok: false, error: 'Could not save' });
    return res.status(200).json({ ok: true, stan: r.data });
  }

  const days = RANGES.hasOwnProperty(b.range) ? RANGES[b.range] : 7;
  const device = ['mobile', 'desktop', 'tablet'].includes(b.device) ? b.device : null;
  const traffic = ['meta', 'other'].includes(b.traffic) ? b.traffic : null;
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : null;
  const [f, m, st, ap] = await Promise.all([
    rpc('rs_dashboard', { p_key: key, p_since: since, p_device: device, p_traffic: traffic }),
    traffic === 'other' ? Promise.resolve(null) : meta(days, device),
    rpc('rs_stan_get', { p_key: key }).catch(() => ({ ok: false })),
    rpc('rs_applications_get', { p_key: key }).catch(() => ({ ok: false })),
  ]);
  if (!f.ok) {
    if (f.data && f.data.message === 'unauthorized') return res.status(401).json({ ok: false, error: 'Wrong access key' });
    console.error('rs_dashboard failed', JSON.stringify(f.data).slice(0, 300));
    return res.status(502).json({ ok: false, error: 'Could not load the funnel' });
  }
  return res.status(200).json({ ok: true, funnel: f.data, meta: m, stan: st && st.ok ? st.data : null, applications: ap && ap.ok ? ap.data : null });
}

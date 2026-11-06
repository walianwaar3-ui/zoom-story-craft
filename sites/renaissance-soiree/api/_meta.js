// Shared Meta helpers for the dashboard (stats.js) and the budget autopilot (allocate.js). Files starting with _ are not routes.
export const ACCOUNT = process.env.META_AD_ACCOUNT || 'act_1124506973279138';
export const GRAPH = 'https://graph.facebook.com/v21.0/';

export function sumActions(list, types) {
  return (list || []).filter(a => types.includes(a.action_type)).reduce((n, a) => n + Number(a.value || 0), 0);
}

// ad id → { content, campaign } from the utm tags in each ad's link, so Meta ads match the page's traffic sources.
let linkCache = { at: 0, map: {} };
export async function adLinks(token) {
  if (Date.now() - linkCache.at < 10 * 60e3) return linkCache.map;
  const map = {};
  let url = GRAPH + ACCOUNT + '/ads?' + new URLSearchParams({ access_token: token, fields: 'id,creative{url_tags,object_story_spec,asset_feed_spec{link_urls}}', limit: '200' });
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

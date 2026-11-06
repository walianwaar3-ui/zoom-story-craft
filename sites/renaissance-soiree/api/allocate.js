// Budget autopilot: every hour, moves the remaining ad money toward the ad sets whose visitors actually choose a tier
// (Stan InitiateCheckout / our tier click) or buy, inside a hard cap of $550 across every campaign in the ad account.
//
// Hard cap: the ad account's own spending limit (spend_cap) is set so Meta itself stops delivery at $550 in total.
// This function only steers money inside that limit; it never raises the limit.
//
// POST { key, apply }  · key = dashboard key (checked by Supabase) · apply=false (default) is a dry run that changes nothing.
// Env: META_ADS_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.
import { ACCOUNT, GRAPH, sumActions, adLinks } from './_meta.js';

const CAP_TOTAL = 550;          // dollars, all campaigns, until the event
const BUFFER = 0.92;            // keep 8% of what is left unallocated: Meta reports spend with a delay
const PRIOR_SPEND = 26, PRIOR_CONV = 1; // account average so far: about one tier choice per $26
const PAUSE_AD_AT = 10;         // an ad with $10+ spent and no tier choice is paused (if its ad set has another live ad)
const PAUSE_SET_AT = 20;        // an ad set / CBO with $20+ spent and no tier choice is paused
const MIN_ALLOC = 2;            // below this an ad set is paused rather than starved
const BUY_WEIGHT = 5;           // one purchase counts as five tier choices
const PACE_MAX = 3;             // an ad set gets at most 3x what it has been able to spend per hour (small warm audiences cannot absorb more)
const SHARP = 1.5;              // how decisively money follows efficiency

async function rpc(fn, args) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + process.env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(8000),
  });
  return { ok: r.ok, data: await r.json().catch(() => null) };
}

async function graph(path, params, token) {
  const r = await fetch(GRAPH + path + '?' + new URLSearchParams({ ...params, access_token: token }), { signal: AbortSignal.timeout(9000) });
  const j = await r.json();
  if (!r.ok) throw new Error('Meta ' + path + ': ' + ((j.error && j.error.message) || r.status));
  return j;
}
async function graphAll(path, params, token) {
  let j = await graph(path, params, token), out = j.data || [];
  for (let i = 0; j.paging && j.paging.next && i < 5; i++) {
    const r = await fetch(j.paging.next, { signal: AbortSignal.timeout(9000) }); j = await r.json(); out = out.concat(j.data || []);
  }
  return out;
}
async function write(id, params, token) {
  const r = await fetch(GRAPH + id, { method: 'POST', body: new URLSearchParams({ ...params, access_token: token }), signal: AbortSignal.timeout(9000) });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.success !== false ? { ok: true } : { ok: false, error: (j.error && (j.error.error_user_msg || j.error.message)) || String(r.status) };
}

const usd = n => '$' + (Math.round(n * 100) / 100).toFixed(2);
const live = s => s === 'ACTIVE';

export async function plan(token, bySource) {
  const now = Date.now();
  const [acct, camps, sets, ads, ins, links] = await Promise.all([
    graph(ACCOUNT, { fields: 'amount_spent,spend_cap' }, token),
    graphAll(ACCOUNT + '/campaigns', { fields: 'id,name,effective_status,daily_budget,lifetime_budget,budget_remaining,stop_time,created_time,spend_cap', limit: '100' }, token),
    graphAll(ACCOUNT + '/adsets', { fields: 'id,name,campaign_id,effective_status,daily_budget,lifetime_budget,budget_remaining,end_time,created_time', limit: '200' }, token),
    graphAll(ACCOUNT + '/ads', { fields: 'id,name,adset_id,campaign_id,effective_status', limit: '300' }, token),
    graphAll(ACCOUNT + '/insights', { level: 'ad', date_preset: 'maximum', fields: 'ad_id,spend,inline_link_clicks,actions', limit: '500' }, token),
    adLinks(token).catch(() => ({})),
  ]);
  const capLeft = Number(acct.spend_cap) > 0 ? (Number(acct.spend_cap) - Number(acct.amount_spent)) / 100 : null;
  const src = {}; (bySource || []).forEach(r => { src[r.src] = r; });
  const insBy = {}; ins.forEach(x => { insBy[x.ad_id] = x; });

  // Per-ad evidence: spend from Meta; tier choices = the larger of our page's tier clicks and Meta's InitiateCheckout (Stan pixel).
  const adRows = ads.map(a => {
    const x = insBy[a.id] || {}, p = src[(links[a.id] || {}).content] || {};
    const ic = sumActions(x.actions, ['offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout']);
    const buys = Math.max(Number(p.paid || 0), sumActions(x.actions, ['offsite_conversion.fb_pixel_purchase', 'purchase']));
    return { id: a.id, name: a.name, set: a.adset_id, camp: a.campaign_id, status: a.effective_status, spend: Number(x.spend || 0),
      visits: Number(p.visit || 0), choices: Math.max(Number(p.checkout || 0), ic), buys, conv: Math.max(Number(p.checkout || 0), ic) + BUY_WEIGHT * buys };
  });

  const actions = [], notes = [];
  // 1. Ads: pause the ones that have had a fair spend and produced nothing, keeping at least one live ad per ad set.
  for (const s of sets.filter(s => live(s.effective_status))) {
    const mine = adRows.filter(a => a.set === s.id && live(a.status));
    const losers = mine.filter(a => a.spend >= PAUSE_AD_AT && a.conv === 0).sort((a, b) => b.spend - a.spend);
    for (const l of losers) {
      if (mine.filter(a => live(a.status)).length <= 1) break;
      l.status = 'PAUSED';
      actions.push({ kind: 'pause_ad', id: l.id, name: l.name, why: usd(l.spend) + ' spent, ' + l.visits + ' visitors, no tier chosen' });
    }
  }

  // 2. Budget holders: a campaign with its own budget (CBO), otherwise each ad set.
  const holders = [];
  for (const c of camps.filter(c => live(c.effective_status))) {
    const cSets = sets.filter(s => s.campaign_id === c.id && live(s.effective_status));
    if (!cSets.length) continue;
    const cbo = Number(c.daily_budget || 0) > 0 || Number(c.lifetime_budget || 0) > 0;
    const groups = cbo ? [{ obj: c, sets: cSets, level: 'campaign' }] : cSets.map(s => ({ obj: s, sets: [s], level: 'adset' }));
    for (const g of groups) {
      const ids = new Set(g.sets.map(s => s.id)), mine = adRows.filter(a => ids.has(a.set));
      const end = Date.parse(g.obj.end_time || g.obj.stop_time || '') || (now + 24 * 3600e3);
      holders.push({
        id: g.obj.id, name: g.obj.name, level: g.level, campName: c.name, campId: c.id,
        daily: Number(g.obj.daily_budget || 0) / 100, lifetime: Number(g.obj.lifetime_budget || 0) / 100,
        remaining: Number(g.obj.budget_remaining || 0) / 100,
        spend: mine.reduce((n, a) => n + a.spend, 0), conv: mine.reduce((n, a) => n + a.conv, 0),
        choices: mine.reduce((n, a) => n + a.choices, 0), buys: mine.reduce((n, a) => n + a.buys, 0),
        liveAds: mine.filter(a => live(a.status)).length, hours: Math.max(0, (end - now) / 3600e3),
        age: Math.max(1, (now - (Date.parse(g.obj.created_time || '') || now - 24 * 3600e3)) / 3600e3),
      });
    }
  }

  // 3. Drop holders that have had a fair test with nothing, or have run out of time or ads.
  const keep = [];
  for (const h of holders) {
    const why = h.liveAds === 0 ? 'no live ads left' : h.hours < 0.5 ? 'ends now' : h.spend >= PAUSE_SET_AT && h.conv === 0 ? usd(h.spend) + ' spent, no tier chosen' : '';
    if (why) actions.push({ kind: 'pause_' + h.level, id: h.id, name: h.name, why }); else keep.push(h);
  }

  // 4. Share what is left by conversion efficiency (tier choices per dollar, smoothed toward the account average), squared so money moves decisively.
  const left = capLeft == null ? null : Math.max(0, capLeft);
  if (left == null) notes.push('No account spending limit is set, so there is no hard cap. Autopilot will not raise budgets.');
  const pool = left == null ? 0 : left * BUFFER;
  keep.forEach(h => {
    h.score = (h.conv + PRIOR_CONV) / (h.spend + PRIOR_SPEND); h.w = Math.pow(h.score, SHARP);
    h.max = Math.max(15, PACE_MAX * (h.spend / h.age) * h.hours); h.alloc = 0;
  });
  // Water-fill: share by weight, cap each at what it can deliver, hand the excess to the rest.
  let rest = pool, open = keep.slice();
  for (let i = 0; i < 10 && open.length && rest > 0.01; i++) {
    const W = open.reduce((n, h) => n + h.w, 0) || 1, capped = [];
    for (const h of open) { const add = rest * h.w / W; if (h.alloc + add >= h.max) { capped.push(h); } }
    if (!capped.length) { open.forEach(h => { h.alloc += rest * h.w / W; }); rest = 0; break; }
    capped.forEach(h => { rest -= h.max - h.alloc; h.alloc = h.max; });
    open = open.filter(h => !capped.includes(h));
  }
  if (rest > 1) notes.push(usd(rest) + ' left unassigned: the ad sets that are working cannot spend more before the event.');
  for (const h of keep) {
    if (left == null) continue;
    if (h.alloc < MIN_ALLOC) { actions.push({ kind: 'pause_' + h.level, id: h.id, name: h.name, why: 'only ' + usd(h.alloc) + ' would be left for it' }); continue; }
    if (h.lifetime > 0) {
      const spentOnBudget = Math.max(0, h.lifetime - h.remaining), target = Math.round((spentOnBudget + h.alloc) * 100) / 100;
      if (Math.abs(target - h.lifetime) >= Math.max(1, h.lifetime * 0.1)) actions.push({ kind: 'lifetime_budget', id: h.id, name: h.name, from: h.lifetime, to: target, why: h.choices + ' tier choices, ' + h.buys + ' buys on ' + usd(h.spend) });
    } else if (h.daily > 0) {
      const target = Math.max(1, Math.round(h.alloc * 24 / Math.max(1, h.hours)));
      if (Math.abs(target - h.daily) >= Math.max(1, h.daily * 0.15)) actions.push({ kind: 'daily_budget', id: h.id, name: h.name, from: h.daily, to: target, why: h.choices + ' tier choices, ' + h.buys + ' buys on ' + usd(h.spend) + ' · ' + usd(h.alloc) + ' over ' + h.hours.toFixed(0) + 'h' });
    }
  }
  // A campaign-level spending limit (set when a campaign was built) would block the new ad set budgets: lift it to fit.
  for (const c of camps.filter(c => live(c.effective_status) && Number(c.spend_cap) > 0)) {
    const spent = adRows.filter(a => a.camp === c.id).reduce((n, a) => n + a.spend, 0);
    const need = spent + keep.filter(h => h.campId === c.id).reduce((n, h) => n + (h.alloc >= MIN_ALLOC ? h.alloc : 0), 0);
    const cap = Number(c.spend_cap) / 100, target = Math.max(100, Math.ceil(need + 2));
    if (left != null && target > cap + 1) actions.unshift({ kind: 'campaign_cap', id: c.id, name: c.name, from: cap, to: target, why: 'its own $' + cap.toFixed(0) + ' limit would block the budgets below; the $' + CAP_TOTAL + ' account limit still holds' });
  }
  if (left != null && left <= 3) { notes.push('Cap reached: everything stops.'); }

  const totalSpent = left == null ? null : CAP_TOTAL - left;
  return {
    at: new Date(now).toISOString(), cap: CAP_TOTAL, left, totalSpent,
    holders: holders.map(h => ({ id: h.id, name: h.name, camp: h.campName, level: h.level, spend: h.spend, choices: h.choices, buys: h.buys,
      daily: h.daily, lifetime: h.lifetime, hours: Math.round(h.hours * 10) / 10, share: h.alloc != null ? Math.round(h.alloc * 100) / 100 : 0 })),
    actions, notes,
  };
}

async function apply(p, token) {
  for (const a of p.actions) {
    const params = a.kind.startsWith('pause') ? { status: 'PAUSED' }
      : a.kind === 'lifetime_budget' ? { lifetime_budget: String(Math.round(a.to * 100)) }
      : a.kind === 'campaign_cap' ? { spend_cap: String(Math.round(a.to * 100)) }
      : { daily_budget: String(Math.round(a.to * 100)) };
    a.result = await write(a.id, params, token);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b.key !== 'string' || !b.key) return res.status(401).json({ ok: false, error: 'Access key required' });
  const key = b.key.slice(0, 100), token = process.env.META_ADS_TOKEN;

  if (b.log) { // dashboard: recent autopilot runs
    const r = await rpc('rs_alloc_get', { p_key: key });
    return res.status(r.ok ? 200 : 401).json({ ok: r.ok, runs: r.ok ? r.data : null });
  }
  const f = await rpc('rs_dashboard', { p_key: key, p_since: null, p_device: null, p_traffic: null });
  if (!f.ok) return res.status(401).json({ ok: false, error: 'Wrong access key' });
  if (!token) return res.status(500).json({ ok: false, error: 'Meta is not connected' });
  try {
    const p = await plan(token, f.data && f.data.bySource);
    const doApply = b.apply === true;
    if (doApply) await apply(p, token);
    p.applied = doApply;
    if (doApply) await rpc('rs_alloc_add', { p_key: key, p_run: p }).catch(() => null);
    return res.status(200).json({ ok: true, plan: p });
  } catch (err) {
    console.error('autopilot failed', err && err.message);
    return res.status(502).json({ ok: false, error: 'Autopilot could not reach Meta' });
  }
}

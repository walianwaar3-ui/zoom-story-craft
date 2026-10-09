// Meta Conversions API: one Purchase per ticket, sent from the server when the coordinator marks the buyer Paid
// on the Seat Passes tab. That is the moment money is confirmed for every payment method (Stripe, bank, JazzCash),
// so the browser no longer reports Purchase; event_id = ticket id makes Meta drop any accidental repeat.
import { createHash } from 'node:crypto';

const PIXEL_ID = '1574207957215946';
const GRAPH = 'https://graph.facebook.com/v23.0';
export const TIER_PRICE = { inner: 33333, general: 11111, pair: 15555, back: 5500 };
const TIER_NAMES = { inner: 'Inner Table', general: 'General Admission', pair: 'Pair Pass', back: 'Back Rows' };

const sha = v => (v ? createHash('sha256').update(v).digest('hex') : undefined);

// Pakistani numbers are stored as typed (0300..., +92 300..., 92300...); Meta wants digits with the country code.
export function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('03')) d = '92' + d.slice(1);
  if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d.length >= 10 ? d : '';
}

export function purchaseEvent(p) {
  const meta = p.meta || {};
  const words = String(p.name || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w && !/^(dr|mr|mrs|ms|miss|prof)$/.test(w));
  const user = {
    em: sha(String(p.email || '').trim().toLowerCase()),
    ph: sha(normPhone(p.phone)),
    fn: sha(words[0]),
    ln: words.length > 1 ? sha(words[words.length - 1]) : undefined,
    country: sha('pk'),
    external_id: sha(p.ticket_id),
    fbp: meta.fbp || undefined,
    fbc: meta.fbc || undefined,
    client_ip_address: meta.ip || undefined,
    client_user_agent: meta.ua || undefined,
  };
  Object.keys(user).forEach(k => user[k] === undefined && delete user[k]);
  const at = Date.parse(p.verified_at) || Date.now();
  return {
    event_name: 'Purchase',
    event_time: Math.floor(at / 1000),
    event_id: 'purchase-' + p.ticket_id,
    // A browser was involved only when we captured it at seat pick; older passes are reported as offline sales.
    action_source: user.client_user_agent ? 'website' : 'system_generated',
    ...(user.client_user_agent ? { event_source_url: 'https://www.infiniterizq.com/seats' } : {}),
    user_data: user,
    custom_data: {
      currency: 'PKR',
      value: TIER_PRICE[p.tier] || 0,
      content_name: TIER_NAMES[p.tier] || p.tier,
      content_type: 'product',
      num_items: (p.seats || []).length || 1,
      order_id: p.ticket_id,
    },
  };
}

export async function sendEvents(events) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return { ok: false, error: 'META_CAPI_TOKEN not set' };
  const body = { data: events };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  const resp = await fetch(`${GRAPH}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

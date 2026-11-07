// Social-proof feed for the landing pages: recent payment-confirmed buyers (first name only) and real visitor and
// seat totals, all computed in the database function ir_proof(). Cached at the edge for a minute.
import { rpc } from './_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const r = await rpc('ir_proof', {});
    if (!r.ok) {
      console.error('proof rpc failed', r.status, r.data);
      return res.status(502).json({ ok: false });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, data: r.data });
  } catch (err) {
    console.error('proof api error', err);
    return res.status(502).json({ ok: false });
  }
}

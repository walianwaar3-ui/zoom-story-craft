// Social-proof toasts on the landing pages. Every line comes from /api/proof: real payment-confirmed buyers
// (first name only) and real visitor and seat totals. First toast at 5 seconds, then one every 14 seconds,
// at most six per visit; closing one stops them for the rest of the visit.
(function(){
  var FIRST = 5000, GAP = 14000, SHOW = 6500, MAX = 6;
  var TIERS = { inner: 'Inner Table', general: 'General Admission', pair: 'Pair Pass', back: 'Back Rows' };
  try { if (sessionStorage.getItem('ir_proof_off') === '1') return; } catch (e) {}

  var css = '.prf{position:fixed;left:12px;z-index:70;max-width:340px;width:calc(100% - 24px);display:flex;gap:12px;align-items:center;' +
    'background:rgba(20,20,24,.97);border:1px solid rgba(212,167,58,.35);border-radius:14px;padding:12px 38px 12px 12px;' +
    'box-shadow:0 14px 40px rgba(0,0,0,.45);color:#c9c3b6;font:400 .82rem/1.4 Inter,system-ui,sans-serif;cursor:pointer;' +
    'opacity:0;transform:translateY(16px);transition:opacity .35s ease,transform .35s ease,bottom .3s ease;pointer-events:none}' +
    '.prf.on{opacity:1;transform:none;pointer-events:auto}' +
    '.prf .ic{flex:0 0 38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(212,167,58,.16);color:#e8c66a;font:600 .95rem "Playfair Display",Georgia,serif}' +
    '.prf b{color:#f3ede1;font-weight:600}.prf small{display:block;color:#8a857b;font-size:.74rem;margin-top:2px}' +
    '.prf .x{position:absolute;top:6px;right:6px;width:26px;height:26px;border:0;background:transparent;color:#8a857b;font-size:18px;line-height:1;cursor:pointer;border-radius:50%}' +
    '.prf .x:hover{color:#f3ede1}' +
    '@media (min-width:760px){.prf{left:20px;width:auto}}' +
    '@media (prefers-reduced-motion:reduce){.prf{transition:opacity .2s}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(iso){
    var m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago');
  }
  function fmt(n){ return Number(n).toLocaleString('en-US'); }

  function build(d){
    var out = [], seen = {}, recent = (d.buyers || []).filter(function(b){
      if (!b.first || !b.at || Date.now() - new Date(b.at).getTime() > 7 * 864e5 || seen[b.first]) return false;
      return (seen[b.first] = true);
    });
    // Alternate Sisters and Brothers so both sides of the hall show up, starting with a sister.
    var sis = recent.filter(function(b){ return b.section === 'sisters'; }), bro = recent.filter(function(b){ return b.section !== 'sisters'; });
    var buyers = [];
    for (var n = 0; n < Math.max(sis.length, bro.length); n++) { if (sis[n]) buyers.push(sis[n]); if (bro[n]) buyers.push(bro[n]); }
    var stats = [];
    if (d.visitors_24h >= 50) stats.push({ ic: '👁', h: '<b>' + fmt(d.visitors_24h) + ' people</b> looked at this event in the last 24 hours', s: 'Infinite Rizq · Lahore, 17 Oct' });
    if (d.live_15m >= 5) stats.push({ ic: '●', h: '<b>' + fmt(d.live_15m) + ' people</b> are viewing this page right now', s: 'Live' });
    // Buyers first (the strongest signal), with a stat after every two.
    var bi = 0, si = 0;
    while (out.length < MAX && (bi < buyers.length || si < stats.length)) {
      for (var k = 0; k < 2 && bi < buyers.length && out.length < MAX; k++, bi++) {
        var b = buyers[bi], side = b.section === 'sisters' ? 'Sisters' : b.section === 'brothers' ? 'Brothers' : '';
        out.push({ ic: esc(b.first.charAt(0)), h: '<b>' + esc(b.first) + '</b> reserved ' + (b.seats > 1 ? b.seats + ' seats' : 'a seat') + ' · ' + esc(TIERS[b.tier] || 'Infinite Rizq'),
          s: (side ? side + "' side · " : '') + ago(b.at) });
      }
      if (si < stats.length && out.length < MAX) out.push(stats[si++]);
    }
    return out;
  }

  function start(items){
    if (!items.length) return;
    var el = document.createElement('div');
    el.className = 'prf'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="ic"></span><span class="tx"></span><button type="button" class="x" aria-label="Close">×</button>';
    document.body.appendChild(el);
    var i = 0, timer, hideT, stopped = false;
    function place(){
      var bar = document.querySelector('[data-mbar]');
      var up = bar && bar.classList.contains('show') && getComputedStyle(bar).display !== 'none';
      el.style.bottom = up ? (bar.offsetHeight + 10) + 'px' : 'calc(16px + env(safe-area-inset-bottom))';
    }
    function show(){
      if (stopped || i >= items.length) return;
      var it = items[i++];
      el.querySelector('.ic').innerHTML = it.ic;
      el.querySelector('.tx').innerHTML = it.h + '<small>' + esc(it.s) + '</small>';
      place(); el.classList.add('on');
      hideT = setTimeout(function(){ el.classList.remove('on'); timer = setTimeout(show, GAP - SHOW); }, SHOW);
    }
    el.addEventListener('click', function(e){
      if (e.target.closest('.x')) {
        stopped = true; clearTimeout(timer); clearTimeout(hideT); el.classList.remove('on');
        try { sessionStorage.setItem('ir_proof_off', '1'); } catch (err) {}
        return;
      }
      if (typeof window.track === 'function') window.track('proof_click', {});
      var t = document.getElementById('tickets'); if (t) t.scrollIntoView({ behavior: 'smooth' });
      el.classList.remove('on');
    });
    window.addEventListener('scroll', function(){ if (el.classList.contains('on')) place(); }, { passive: true });
    timer = setTimeout(show, FIRST);
  }

  var began = Date.now();
  fetch('/api/proof').then(function(r){ return r.json(); }).then(function(j){
    if (!j || !j.ok || !j.data) return;
    var items = build(j.data);
    // Keep the 5-second promise even when the feed is slow: show the first toast at 5s or as soon as data lands.
    FIRST = Math.max(0, FIRST - (Date.now() - began));
    start(items);
  }).catch(function(){});
})();

// World Wealth Organization site: mobile menu, waiting-list forms, gallery lightbox, scroll reveal.
document.documentElement.classList.add('js');
(function(){
  function $all(s, root){ return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  // Mobile menu
  var burger = document.querySelector('.burger'), menu = document.querySelector('.menu');
  if (burger && menu) {
    burger.addEventListener('click', function(){
      var open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    });
    $all('a', menu).forEach(function(a){ a.addEventListener('click', function(){ menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }); });
  }

  // Waiting lists: <form class="wl" data-list="waitlist-events"> → /api/optin
  $all('form.wl[data-list]').forEach(function(f){
    var msg = f.querySelector('.msg'), go = f.querySelector('button[type="submit"]');
    function bad(t){ msg.textContent = t; msg.className = 'msg err'; go.disabled = false; }
    f.addEventListener('submit', function(e){
      e.preventDefault();
      var name = f.elements.name.value.trim(), email = f.elements.email.value.trim(), phone = f.elements.phone.value.trim();
      if (name.length < 2) return bad('Please enter your full name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Please enter a valid email.');
      if (phone.replace(/\D/g, '').length < 10) return bad('Please enter your WhatsApp number.');
      go.disabled = true; msg.className = 'msg'; msg.textContent = 'Adding you to the list…';
      fetch('/api/optin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: f.getAttribute('data-list'), name: name, email: email, phone: phone,
          src: location.pathname, website: f.elements.website ? f.elements.website.value : '' }) })
        .then(function(r){ return r.json(); })
        .then(function(j){
          if (!j.ok) return bad(j.error || 'Could not save right now. Please try again.');
          try { if (window.fbq) fbq('track', 'Lead', { content_name: f.getAttribute('data-list') }); } catch (x) {}
          f.innerHTML = '<div class="ok"><b>You’re on the list, ' + name.split(' ')[0].replace(/[<>&"]/g, '') + '.</b>' +
            (f.getAttribute('data-done') || 'We’ll message you on WhatsApp the moment it opens.') + '</div>';
        })
        .catch(function(){ bad('Network error. Please try again.'); });
    });
  });

  // Gallery lightbox
  var lb = document.querySelector('.lightbox');
  if (lb) {
    var img = lb.querySelector('img');
    $all('.gallery button').forEach(function(b){
      b.addEventListener('click', function(){ var i = b.querySelector('img'); img.src = i.getAttribute('data-full') || i.src; img.alt = i.alt; lb.classList.add('on'); });
    });
    function close(){ lb.classList.remove('on'); img.removeAttribute('src'); }
    lb.addEventListener('click', function(e){ if (e.target !== img) close(); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') close(); });
  }

  // Scroll reveal
  var items = $all('.rv');
  if (!('IntersectionObserver' in window)) { items.forEach(function(el){ el.classList.add('in'); }); return; }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: .08, rootMargin: '0px 0px -30px 0px' });
  items.forEach(function(el){ io.observe(el); });
})();

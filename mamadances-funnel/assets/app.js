/* MamaDances / MamanDanse, Page 1 (CA$27 front end).
   Copy lives in /copy/fr.json and /copy/en.json. French is the default.
   Routes: "/" and "/fr/" serve French, "/en/" serves English. */
(function () {
  "use strict";

  // Turn off before launch: hides the "to confirm" badges on unconfirmed items.
  var DRAFT = true;

  var PRICES = { main: 27, bump1: 17, bump2: 27 };
  var COOKIE = "md_lang";
  var cache = {};
  var copy = null;
  var lang = "fr";

  // ---------- storage (wrapped, it can throw) ----------
  function readCookie() {
    try {
      var m = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=(fr|en)"));
      return m ? m[1] : null;
    } catch (e) { return null; }
  }
  function writeCookie(v) {
    try { document.cookie = COOKIE + "=" + v + "; path=/; max-age=31536000; SameSite=Lax"; } catch (e) { /* ignore */ }
  }

  function pickLang() {
    var path = location.pathname;
    if (/^\/en(\/|$)/.test(path)) return "en";
    if (/^\/fr(\/|$)/.test(path)) return "fr";
    var saved = readCookie();
    if (saved) return saved;
    // First visit on "/": follow the browser language once.
    var nav = (navigator.language || "fr").toLowerCase();
    return nav.indexOf("en") === 0 ? "en" : "fr";
  }

  // ---------- tiny markup: *highlight* and **bold** ----------
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function md(s) {
    // French typography: keep "?", "!", ":", ";" and guillemets on the same line as the word.
    if (lang === "fr") s = String(s).replace(/ ([?!:;\u00bb])/g, "\u00a0$1").replace(/\u00ab /g, "\u00ab\u00a0");
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, '<span class="hl">$1</span>');
  }
  function get(key) {
    return key.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, copy);
  }

  function money(n) {
    return lang === "fr" ? n + " $" : "CA$" + n;
  }

  var ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6zM14 3v5h5M9 12h8M9 16h8"/></svg>',
    music: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/></svg>',
    room: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v10H3zM9 21v-6h6v6"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4v-7h16v7h-2M6 14h12v8H6z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>'
  };

  // ---------- renderers ----------
  var R = {
    list: function (el) {
      el.innerHTML = get(el.dataset.key).map(function (t) { return "<li>" + md(t) + "</li>"; }).join("");
    },
    paras: function (el) {
      el.innerHTML = get(el.dataset.key).map(function (t) { return "<p>" + md(t) + "</p>"; }).join("");
    },
    stats: function (el) {
      el.innerHTML = copy.stats.map(function (s) {
        return '<div class="stat"><p class="stat__big">' + md(s.big) + '</p><p class="stat__small">' + md(s.small) + "</p></div>";
      }).join("");
    },
    kit: function (el) {
      var k = copy.kit, keys = ["play", "plan", "music", "room"];
      el.innerHTML =
        '<div class="kit__top"></div>' +
        '<p class="kit__tag">' + md(k.tag) + "</p>" +
        '<p class="kit__title">' + md(k.title) + "</p>" +
        '<p class="kit__sub">' + md(k.sub) + "</p>" +
        '<div class="kit__icons">' + k.icons.map(function (t, i) {
          return '<span class="kit__icon"><span class="kit__circle">' + ICONS[keys[i]] + "</span>" + md(t) + "</span>";
        }).join("") + "</div>" +
        '<p class="kit__foot">' + md(k.foot) + "</p>" +
        '<p class="kit__brand">' + md(copy.brand.name) + "</p>";
    },
    get: function (el) {
      el.innerHTML = copy.get.items.map(function (it) {
        return "<li><strong>" + md(it.name) + "</strong> " + md(it.text) + "</li>";
      }).join("");
    },
    steps: function (el) {
      var keys = ["eye", "print", "heart"];
      el.innerHTML = copy.how.steps.map(function (t, i) {
        var confirm = i === 0 ? " data-confirm" : "";
        return '<li class="step"' + confirm + '><span class="step__icon">' + ICONS[keys[i]] + '</span><span class="step__num">' +
          esc(copy.how.step_label) + " " + (i + 1) + '</span><span class="step__text">' + md(t) + "</span></li>";
      }).join("");
    },
    quotes: function (el) {
      el.innerHTML = copy.testimonials.items.map(function (q) {
        return '<figure class="quote"><span class="quote__mark" aria-hidden="true">&ldquo;</span><blockquote>' + md(q.quote) +
          '</blockquote><figcaption><strong>' + md(q.name) + "</strong><span>" + md(q.town) + "</span></figcaption></figure>";
      }).join("");
    },
    faq: function (el) {
      el.innerHTML = copy.faq.items.map(function (f, i) {
        var confirm = (i === 3 || i === 4 || i === 5) ? " data-confirm" : "";
        return '<details class="faq__item"' + confirm + "><summary>" + md(f.q) + '<span class="faq__plus" aria-hidden="true">+</span></summary><p>' + md(f.a) + "</p></details>";
      }).join("");
    }
  };

  function variant() {
    try { return new URLSearchParams(location.search).get("v") === "b" ? "b" : "a"; } catch (e) { return "a"; }
  }

  function render() {
    document.documentElement.lang = lang;
    document.title = copy.meta.title;
    var d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute("content", copy.meta.description);

    document.querySelectorAll("[data-t]").forEach(function (el) {
      var key = el.dataset.t;
      if (key === "hero.headline" && variant() === "b") key = "hero.headline_b";
      el.innerHTML = md(get(key));
    });
    document.querySelectorAll("[data-attr-aria-label]").forEach(function (el) {
      el.setAttribute("aria-label", get(el.dataset.attrAriaLabel));
    });
    document.querySelectorAll("[data-render]").forEach(function (el) { R[el.dataset.render](el); });
    document.querySelectorAll(".lang__btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    });

    document.body.classList.toggle("draft", DRAFT);
    document.querySelectorAll("[data-confirm]").forEach(function (el) { el.dataset.confirmLabel = copy.draft.confirm; });

    updateTotal();
    document.body.classList.remove("is-loading");
  }

  function load(l) {
    if (cache[l]) return Promise.resolve(cache[l]);
    return fetch("/copy/" + l + ".json").then(function (r) { return r.json(); }).then(function (j) { cache[l] = j; return j; });
  }

  function setLang(l, push) {
    return load(l).then(function (j) {
      lang = l; copy = j;
      var y = window.scrollY;
      render();
      window.scrollTo(0, y); // toggle keeps the same section
      writeCookie(l);
      if (push) {
        try { history.replaceState(null, "", "/" + l + "/" + location.search + location.hash); } catch (e) { /* ignore */ }
      }
    });
  }

  // ---------- checkout ----------
  var modal, form, lastFocus;

  function total() {
    var t = PRICES.main;
    if (form.bump1.checked) t += PRICES.bump1;
    if (form.bump2.checked) t += PRICES.bump2;
    return t;
  }

  function updateTotal() {
    if (!form || !copy) return;
    var c = copy.checkout;
    var rows = [[c.line_main, PRICES.main]];
    if (form.bump1.checked) rows.push([c.line_bump1, PRICES.bump1]);
    if (form.bump2.checked) rows.push([c.line_bump2, PRICES.bump2]);
    document.getElementById("co-summary").innerHTML =
      rows.map(function (r) { return '<p class="summary__row"><span>' + esc(r[0]) + "</span><span>" + money(r[1]) + "</span></p>"; }).join("") +
      '<p class="summary__row summary__total"><span>' + esc(c.total) + "</span><span>" + money(total()) + "</span></p>";
    document.getElementById("co-pay").textContent = c.pay + " " + money(total());
    form.querySelectorAll(".bump").forEach(function (b) {
      b.classList.toggle("is-on", b.querySelector("input").checked);
    });
  }

  function openCheckout() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    setTimeout(function () { form.email.focus(); }, 30);
  }
  function closeCheckout() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocus) lastFocus.focus();
  }

  function initCheckout() {
    modal = document.getElementById("checkout");
    form = document.getElementById("co-form");
    document.querySelectorAll(".js-buy").forEach(function (b) { b.addEventListener("click", openCheckout); });
    modal.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", closeCheckout); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeCheckout(); });
    form.addEventListener("change", updateTotal);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      // Next step: create the PaymentIntent in /api/checkout (Stripe, CAD), store lang in customer metadata.
      document.getElementById("co-notice").hidden = false;
    });
  }

  // ---------- video placeholder ----------
  function initVideo() {
    var v = document.getElementById("video");
    v.addEventListener("click", function () { v.classList.add("is-playing"); });
  }

  // ---------- boot ----------
  document.addEventListener("DOMContentLoaded", function () {
    initCheckout();
    initVideo();
    document.querySelectorAll(".lang__btn").forEach(function (b) {
      b.addEventListener("click", function () { if (b.dataset.lang !== lang) setLang(b.dataset.lang, true); });
    });
    setLang(pickLang(), false);
  });
})();

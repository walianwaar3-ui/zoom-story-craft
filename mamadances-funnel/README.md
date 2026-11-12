# MamaDances funnel

Static funnel for Vercel: CA$27 front end, upsell 1 (CA$27), upsell 2 (CA$97), thank-you, and the Montreal application. One `index.html`, one `<main data-page>` per page. French is the default, English is one tap away.

- Routes: `/fr/`, `/fr/upsell-1`, `/fr/upsell-2`, `/fr/thank-you`, `/fr/apply` (and the same under `/en/`). Language is saved in a cookie.
- Checkout skips upsell 1 when bump 2 was bought.
- `internal/funnel-map.html` is the funnel map for Wali and Eryn (not deployed).
- Copy lives in `copy/fr.json` and `copy/en.json` (same keys, tests enforce it).
- `?v=b` shows headline B ("empty studio in the morning") for the A/B test.
- `DRAFT = true` in `assets/app.js` shows yellow "to confirm" badges on every [CONFIRM] item. Set it to false before launch.

```
npm run dev     # local server on :4173 (same routes as vercel.json)
npm test        # copy rules: key parity, no dashes, no hype, short sentences, prices
npm run shots   # 390px screenshots in FR and EN (server must be running)
```

Not wired yet: Stripe Payment Element (`#payment-element`), `/api/checkout`, one-click `/api/upsell`, `/api/apply`, Kajabi grants, tracking.

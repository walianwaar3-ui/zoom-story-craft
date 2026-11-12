# MamaDances funnel, Page 1 (CA$27 front end)

Static page for Vercel. French is the default, English is one tap away.

- `/` and `/fr/` serve French, `/en/` serves English. The choice is saved in a cookie.
- Copy lives in `copy/fr.json` and `copy/en.json` (same keys, tests enforce it).
- `?v=b` shows headline B ("empty studio in the morning") for the A/B test.
- `DRAFT = true` in `assets/app.js` shows yellow "to confirm" badges on every [CONFIRM] item. Set it to false before launch.

```
npm run dev     # local server on :4173 (same routes as vercel.json)
npm test        # copy rules: key parity, no dashes, no hype, short sentences, prices
npm run shots   # 390px screenshots in FR and EN (server must be running)
```

Not wired yet: Stripe Payment Element (`#payment-element`), `/api/checkout`, Kajabi grant, tracking.

# J.K. Nolan Website

Homepage for J.K. Nolan, built from the Figma file **"JK Nolan Website | Dev"** (desktop *Homepage* frame).

Plain static site: one `index.html` (HTML + CSS + vanilla JS), images in `assets/img/`. No build step.

## Run locally

Lives in the Wali OS repo at `public/clients/jk-nolan/`. Vite copies `public/` as-is, so after deploy it is served at `/clients/jk-nolan/`.

To preview locally, open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploy

Works as-is on Vercel, Netlify or GitHub Pages. Point the project at the repo root with no build command.

## Effects

- Hero headline rises in, photo collage drops into place, and the hand-drawn underline and circle draw on load.
- Hand-drawn strokes elsewhere draw when scrolled into view, and sections fade up.
- The case-study stats count up when they come into view.
- The contact letter starts sealed in the envelope and slides out when the envelope scrolls into view (or on "Open the letter").
- Hover states on photos, offers, inventory rows, buttons and links.
- Everything is shown without motion when the visitor prefers reduced motion, and the page is fully readable without JavaScript.

## Still to connect

- **Begin your application** button: add the real form URL (for example a GoHighLevel survey).
- **View Case Study / Explore the Symphony / Explore the Index**: no pages exist for these yet.
- The `394m` stat has no `$` sign, matching the Figma. Confirm whether it should read `$394M`.

# Arroyo Church — Website Redesign

**"A River in the Desert"** — a single-file redesign of [arroyochurch.com](https://www.arroyochurch.com/) built around the church's Isaiah 43:18–19 name story.

## What's here

- `index.html` — the entire site. One self-contained file: all CSS and JavaScript inline, no frameworks, no build step. Images load from the existing Squarespace CDN; sermon videos lazy-embed from YouTube.
- `.source_pages/` — archived HTML of the original Squarespace pages (content source of truth used for the rebuild).

## To view it

Just open `index.html` in any browser, or serve it:

```bash
cd ~/arroyo-church-redesign && python3 -m http.server 8742
# then visit http://localhost:8742
```

## To deploy it

Any static host works — Netlify / Vercel / Cloudflare Pages / GitHub Pages: drag-and-drop or point it at this folder. To put it on the real domain you'd point `arroyochurch.com` DNS at the host (or keep Squarespace and use this as a design reference).

## Design / feature notes

- **Scroll narrative**: the "Why Arroyo?" section transitions desert sand → deep river water while Isaiah 43:18–19 lights up word-by-word and an SVG river draws itself down the page.
- **Live countdown** to the next Sunday 10:00 AM service (Pacific, DST-safe); shows "We're gathered right now" during the service hour.
- **Animations**: water-particle hero canvas (mouse-reactive), magnetic buttons, 3D tilt cards, sticky-stacking value cards, staggered scroll reveals, custom cursor, river scroll-progress bar. All effects respect `prefers-reduced-motion`, and all content is visible with JavaScript disabled.
- **Same information tabs** as the current site: About, Team, Beliefs, Sermons, Connect, Give, Plan Your Visit — all original text preserved verbatim (beliefs, values, FAQs, staff bios, elder board).
- **Live links preserved**: Overflow giving (cash/stock/crypto), Church Center group signup form, YouTube channel + latest four sermons, socials, mailto/tel.
- **Accessibility**: WCAG AA contrast throughout, keyboard-operable accordions/cards/menu with focus management, `<main>` landmark + skip link, screen-reader-correct accordion and team-card semantics.

## Maintenance

- **Sermon videos**: update the four `data-id` / `data-title` attributes in the Sermons section with new YouTube video IDs.
- **Team changes**: each person is one `tcard` block (staff) or `ecard` block (elders).
- **Service time/address**: appears in the hero, countdown strip, visit section, and footer.

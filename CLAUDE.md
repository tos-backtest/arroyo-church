# Arroyo Church website — project guide

Maintainers + Claude Code: read this before changing anything. The live site is
**arroyochurch.com** (Squarespace 7.1). This repo drives the custom design, the
two on-site forms, and the weekly sermon→blog automation.

## What this is
The home page is a single rich scroll experience implemented as **one injected
file**: `squarespace/footer-injection.html` (HTML + CSS + JS). Its JavaScript
builds every home section at runtime and injects it into the live Squarespace
page via **Footer Code Injection**. Editing that file + re-deploying it (see
below) is how ~all visual/site changes happen.

## Repo layout
- **`squarespace/footer-injection.html`** — THE master file. Builds (home-only,
  gated by `HOME()`): hero → countdown → "what to expect" → sermons → mission →
  story/river → beliefs → values → team → connect (+ Join-a-Group form) → give →
  plan-your-visit (+ visit form) → CTA → footer.
- `squarespace/arroyo-connect-worker.js` — Cloudflare Worker: Join-a-Group form → Planning Center. Field map is in its header comment.
- `scripts/generate_blog.py`, `scripts/run-blog.sh`, `scripts/com.arroyo.blog.plist` — weekly sermon→blog generator (runs on the maintainer's Mac via launchd).
- `scripts/sync-youtube.mjs` + `.github/workflows/sync-youtube.yml` — daily Action writing `data/sermons.json` / `data/podcasts.json`.
- `data/` — auto-synced YouTube data the live site fetches at runtime.
- `blog-drafts/` — generated drafts to review + paste into the blog.

## ► Deploying a site change (DO THIS EXACTLY)
1. Edit `squarespace/footer-injection.html`.
2. **Syntax-check the JS** before deploying: extract the `<script>` block and run
   `jsc` (`/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`).
   `SyntaxError` = broken, fix it. `ReferenceError` (e.g. `matchMedia`) = fine — it parsed.
3. `git commit` + `git push` to `main`. GitHub Pages then serves the file at
   `https://tos-backtest.github.io/arroyo-church/squarespace/footer-injection.html`
   (~30s–2min lag; cache-bust with `?cb=<timestamp>`).
4. **Push it live in Squarespace:** Settings → Advanced → Code Injection. Replace
   the **FOOTER** field with the new file contents, then **Save**.
   - ⚠️ The Code Injection page has several CodeMirror editors. **idx 0 = HEADER =
     the Church/LocalBusiness JSON-LD schema — NEVER overwrite it.** The FOOTER is
     the editor whose content contains `buildHero`/`ac-hero`. After saving, confirm
     the HEADER still contains `"@type": "Church"`.
   - Squarespace trims ~1 trailing char on save — harmless.
5. Verify on www.arroyochurch.com (hard refresh; CDN lags ~20–40s).

## Gotchas (these will bite you)
- Site sets `html{scroll-behavior:smooth!important}` → programmatic `scrollTo`
  silently no-ops. Fix: `de.style.setProperty('scroll-behavior','auto','important')`
  then an instant `scrollTo` (see `go()` / `wireScrollLinks()`).
- To **reorder home sections**: change the call order in `acInitSections()` AND the
  per-section `anchor` ids (each section inserts itself after a specific id).
- Form fields: always set `box-sizing:border-box` (the site's global form CSS is
  content-box → inputs overflow their column otherwise).
- Section vertical rhythm is tuned per-section; watch dark→light section
  transitions on mobile (big stacked padding looks like dead space).

## Integrations (secrets are NOT in this repo)
- **Plan a Visit form** → Web3Forms (public site key lives in the file; emails the pastor). No backend.
- **Join a Group form** → Cloudflare Worker `arroyo-connect`
  (`https://arroyo-connect.dakota-fac.workers.dev`) which holds the Planning Center
  token as an encrypted secret and POSTs to People form 1206123. Worker code +
  field map: `squarespace/arroyo-connect-worker.js`. Anti-spam = Cloudflare Turnstile.
- **Countdown "Watch Live" button** → `youtube.com/@arroyochurch/live` (auto-resolves to the current stream during the Sun 10:00–11:30am window).
- **Weekly blog** → runs on the maintainer's Mac only (launchd `com.arroyo.blog`,
  daily 9:15am): downloads the latest sermon's audio, transcribes it locally with
  faster-whisper, has Claude write an SEO post into `blog-drafts/`. **Squarespace
  has no blog API**, so a human pastes the draft into the `/arroyoblog` blog and
  publishes. The Anthropic key lives only at `~/.config/arroyo/anthropic.env`.

## Do NOT touch / SEO guardrails
- The **HEADER** code injection (Church schema).
- The standalone pages (/about, /team, /messages, /connect, /give,
  /plan-your-visit) and the **/arroyoblog** blog (~170 indexed URLs) — they're kept
  live + indexed for SEO. Don't delete, redirect, or strip their content.
- Never commit or share secrets: the Planning Center token and the Anthropic API key.

## Working solo (for a new collaborator)
You'll need: push access to `tos-backtest/arroyo-church`, and a Squarespace
contributor invite (Website Editor or Admin) to do the Code Injection deploy step.
The blog automation + the integration secrets stay with the primary maintainer —
collaborators work on the site code (the master file) and the standalone pages.

# Arroyo Church — Go-Live Runbook (tonight, 6:00 PM PT)

Applying the reskin to the **live** arroyochurch.com. Everything here is reversible and **touches zero SEO** (no URLs, titles, meta, schema, or blog).

## Before we start (you do this)
1. At your computer, **Chrome open** with the Claude extension signed in.
2. Log into the **live** site: account.squarespace.com → **Arroyo Church** (www.arroyochurch.com — *not* the Copy) → **Website / Edit**.
3. Message me here: "ready on live."

## Order of operations (I drive)
Proven on the copy; same steps on live. ~30–45 min.

1. **Site Styles → Fonts**: Headings → **Fraunces**, Paragraphs → **Manrope**. (Save)
2. **Site Styles → Colors → Edit Palette**: apply the warm desert preset (paper/sand/brown). (Save)
3. **Design → Custom CSS**: paste `custom-css.css` (whole file). (Save) — instant: gold pill buttons, hover cards, accordion styling, scroll-progress bar, section gradients.
4. **Settings → Advanced → Code Injection → FOOTER**: paste `footer-injection.html`. (Save) — cursor + hero particles + safe scroll-reveal. *This is the piece the trial couldn't run; it runs here.*
5. **Verify live** (I'll do this): load the home page, confirm buttons/fonts/palette, confirm particles + cursor + reveal animations run, check mobile, check a couple of interior pages.
6. **Fine-tune** any CSS values that need it against the live layout.

## Safety / rollback (any step, instantly)
- **Custom CSS**: clear the box → Save. Reverts styling.
- **Footer injection**: clear the box → Save. Reverts all JS effects.
- **Fonts / Colors**: Site Styles has undo; or reset to prior values.
- The **Header injection (your schema) is never touched.**
- Scroll-reveal is built so a JS failure can **never** hide content (auto-reveal safety net).

## Files to paste (this folder)
- `custom-css.css` → Design → Custom CSS
- `footer-injection.html` → Code Injection → Footer

## Not in tonight's first pass (add after core is verified live)
- Countdown block (home) — `code-block-countdown.html` as a Code block
- River animation + headline word-reveal — section-placed, added once core is stable
- Per-page section rebuilds (team grid, beliefs/FAQ accordions, give cards)

## Status going in
Verified working on the copy: Fraunces + Manrope + warm palette + gold buttons + Custom CSS effects; particles + cursor demonstrated on the real hero. Correct button selector confirmed: `.sqs-button-element--primary`.

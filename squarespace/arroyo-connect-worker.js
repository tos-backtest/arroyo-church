/**
 * Arroyo Church — "Get Connected" relay (Cloudflare Worker).
 *
 * Receives on-site form POSTs from arroyochurch.com (the home "Join a Group"
 * form AND the /connect-tag digital connect card), validates + anti-spam, and
 * creates a Planning Center People form submission (form 1206123) using a
 * Personal Access Token held SERVER-SIDE. The token never reaches the browser.
 *
 * Confirmed working against the live API 2026-06-21 (HTTP 201).
 *
 * ── Request body (all clients) ──
 *   { first, last, email, phone,           // person fields
 *     nextSteps: ["<option id>", ...],     // multi-select "What's your next step?"
 *     group: "<option id>",                // only when "join a group" is selected
 *     team:  ["<option id>", ...],         // only when "start serving" is selected (forward-compat; see TEAM_OPTIONS)
 *     message: "...",                       // free text / prayer request
 *     website, turnstileToken }             // honeypot + Turnstile
 *   Legacy: the home form may send {group} with no nextSteps — handled below.
 *
 * ── Secrets (set as ENCRYPTED secrets, never plaintext vars) ──
 *   PC_APP_ID         Planning Center PAT — Application ID
 *   PC_SECRET         Planning Center PAT — Secret
 *   TURNSTILE_SECRET  (optional) Cloudflare Turnstile secret key. If set, the
 *                     form's Turnstile token is verified. Omit to skip for now.
 *
 * ── Confirmed field map for form 1206123 ──
 *   Phone (text)             9974695 -> value = phone string
 *   "What's your next step?"  9567926 -> value = option id (ONE value per selected option)
 *        10625856 placed faith · 10558271 Connect Class · 10558272 join a group
 *        10648022 baptized · 10558273 start serving
 *   "Join a Connect Group"   9567985 -> value = option id (only with next-step "join a group")
 *        10558346 Couples Mon 7p · 10558347 Men Tue 6:30p · 10558348 Women Wed 6p
 *        10558349 Moms · 10558350 RecConnect · 10558351 Young Adults Thu 7p · 10558352 Students
 *   "Which team"             9568011 -> value = option id (only with next-step "start serving")
 *        Option ids UNCONFIRMED — TEAM_OPTIONS below is a placeholder whitelist; the
 *        front end does NOT send team yet. Confirm ids in PC, then enable the picker.
 *   Message (text)           9630046 -> value = text (also the prayer-request channel)
 *   Name/email/phone also written to the person profile via person_attributes.
 */

const FORM_ID = "1206123";
const PC_URL = `https://api.planningcenteronline.com/people/v2/forms/${FORM_ID}/form_submissions`;

const ALLOWED_ORIGINS = new Set([
  "https://www.arroyochurch.com",
  "https://arroyochurch.com",
]);

const F_PHONE = "9974695", F_NEXT = "9567926", F_GROUP = "9567985", F_TEAM = "9568011", F_MESSAGE = "9630046";
const NEXT_STEP_JOIN = "10558272";  // "I want to join a Connect Group"
const NEXT_STEP_SERVE = "10558273"; // "I want to start serving"
// Whitelists — any option id not listed here is silently ignored (defends against tampering).
const VALID_NEXT_STEPS = new Set(["10625856","10558271","10558272","10558273","10648022"]);
const GROUP_OPTIONS = new Set(["10558346","10558347","10558348","10558349","10558350","10558351","10558352"]);
// Placeholder — confirm these against the live PC "Which team" field before the front end sends team[].
const TEAM_OPTIONS = new Set(["10558402","10558403","10558404","10558405","10558406"]);

function cors(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.arroyochurch.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json({ success: false, error: "method" }, 405, origin);
    if (!ALLOWED_ORIGINS.has(origin)) return json({ success: false, error: "origin" }, 403, origin);

    let b;
    try { b = await request.json(); } catch { return json({ success: false, error: "bad_json" }, 400, origin); }

    // Honeypot: real users never fill the hidden "website" field. Pretend success, submit nothing.
    if (b.website) return json({ success: true }, 200, origin);

    // Turnstile (only enforced if a secret is configured)
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET, b.turnstileToken, request.headers.get("CF-Connecting-IP"));
      if (!ok) return json({ success: false, error: "captcha" }, 403, origin);
    }

    const first = (b.first || "").trim();
    const last = (b.last || "").trim();
    const email = (b.email || "").trim();
    const phone = (b.phone || "").trim();
    const message = (b.message || "").toString().trim();

    // Selected next-steps (multi-select), whitelisted + de-duped.
    let steps = Array.isArray(b.nextSteps) ? b.nextSteps.map(String).filter((s) => VALID_NEXT_STEPS.has(s)) : [];
    // Backward-compat: the legacy home "Join a Group" form sends {group} with NO nextSteps array.
    // (The home + worker deploys aren't atomic, so this fallback closes the regression window.)
    if (steps.length === 0 && b.group && GROUP_OPTIONS.has(String(b.group))) steps.push(NEXT_STEP_JOIN);
    steps = [...new Set(steps)];

    // Email is required EXCEPT for a prayer-only capture (no next-steps, just a message) — don't
    // gate a vulnerable ask behind an email. first + last + phone are always required.
    const prayerOnly = steps.length === 0 && !!message;
    if (!first || !last || !phone) return json({ success: false, error: "missing" }, 422, origin);
    if (!prayerOnly && !email) return json({ success: false, error: "missing" }, 422, origin);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ success: false, error: "email" }, 422, origin);

    const values = [{ form_field_id: F_PHONE, value: phone }];
    steps.forEach((id) => values.push({ form_field_id: F_NEXT, value: id }));
    if (steps.includes(NEXT_STEP_JOIN) && b.group && GROUP_OPTIONS.has(String(b.group))) {
      values.push({ form_field_id: F_GROUP, value: String(b.group) });
    }
    if (steps.includes(NEXT_STEP_SERVE) && Array.isArray(b.team)) {
      b.team.map(String).forEach((t) => { if (TEAM_OPTIONS.has(t)) values.push({ form_field_id: F_TEAM, value: t }); });
    }
    if (message) values.push({ form_field_id: F_MESSAGE, value: message.slice(0, 2000) });

    const person_attributes = {
      first_name: first,
      last_name: last,
      phone_numbers_attributes: [{ location: "Mobile", number: phone }],
    };
    // Prayer-only submissions create a person with NO email. Verify PC accepts this in the
    // go/no-go test (a no-email submission); if PC 422s, require email here even for prayer-only.
    if (email) person_attributes.emails_attributes = [{ location: "Home", address: email }];

    const payload = {
      data: {
        type: "FormSubmission",
        attributes: {
          person_attributes,
          form_submission_values_attributes: values,
        },
      },
    };

    let pcRes;
    try {
      pcRes = await fetch(PC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa(`${env.PC_APP_ID}:${env.PC_SECRET}`),
        },
        body: JSON.stringify(payload),
      });
    } catch {
      return json({ success: false, error: "upstream" }, 502, origin);
    }

    if (pcRes.status === 201 || pcRes.status === 200) return json({ success: true }, 200, origin);

    // Log server-side (visible in `wrangler tail` / dashboard logs); never leak to the client.
    console.log("PC submit failed", pcRes.status, await pcRes.text().catch(() => ""));
    return json({ success: false, error: "submit_failed" }, 502, origin);
  },
};

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const d = await r.json();
    return !!d.success;
  } catch {
    return false;
  }
}

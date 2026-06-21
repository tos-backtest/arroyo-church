// Weekly sermon -> blog-post generator (the CONTENT half of the blog pipeline).
//
// Reads the latest sermon from data/sermons.json, pulls its YouTube auto-caption
// transcript (yt-dlp), and asks Claude (Opus 4.8, structured output) to write a
// genuinely useful, SEO-aware post — real title, original summary + application,
// scripture references, a video embed, tasteful (not stuffed) local relevance,
// a meta description, a few meaningful tags, and internal links.
//
// Output: blog-drafts/<date>-<slug>.html (paste-ready) + .json (the fields).
// Idempotent: skips if a draft already exists for the latest sermon's video id,
// so the weekly run only generates when a NEW sermon appears.
//
// Requires: ANTHROPIC_API_KEY (env / GitHub Actions secret), yt-dlp on PATH,
// and `npm install @anthropic-ai/sdk` before running.

import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";

const DRAFTS = "blog-drafts";
const sermons = JSON.parse(readFileSync("data/sermons.json", "utf8"));
const v = (sermons.videos || [])[0];
if (!v) { console.error("no latest sermon in data/sermons.json"); process.exit(1); }
const series = sermons.series || {};
const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
const today = new Date().toISOString().slice(0, 10);

mkdirSync(DRAFTS, { recursive: true });

// ---- idempotency: skip if a draft already references this video id ----
const already = readdirSync(DRAFTS)
  .filter(f => f.endsWith(".json"))
  .some(f => { try { return JSON.parse(readFileSync(`${DRAFTS}/${f}`, "utf8")).videoId === v.id; } catch { return false; } });
if (already) { console.log(`Draft already exists for ${v.id} ("${v.title}") — nothing to do.`); process.exit(0); }

// ---- transcript via yt-dlp auto-captions ----
function cleanVtt(vtt) {
  const seen = new Set(), out = [];
  for (const raw of vtt.split(/\r?\n/)) {
    if (!raw || /-->/.test(raw) || /^\d+$/.test(raw) || /^(WEBVTT|Kind:|Language:)/.test(raw)) continue;
    const t = raw.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!t || seen.has(t)) continue;          // drop rolling-duplicate caption lines
    seen.add(t); out.push(t);
  }
  return out.join(" ");
}
let transcript = "";
try {
  execFileSync("yt-dlp", ["--quiet", "--no-warnings", "--skip-download", "--write-auto-sub",
    "--sub-lang", "en", "--sub-format", "vtt", "-o", "/tmp/ac_sermon.%(ext)s", videoUrl], { stdio: "ignore" });
  transcript = cleanVtt(readFileSync("/tmp/ac_sermon.en.vtt", "utf8"));
} catch (e) {
  console.error("transcript fetch failed:", e.message);
}
if (!transcript || transcript.length < 400) { console.error("transcript too short/empty — aborting so we don't write a thin post"); process.exit(1); }

// ---- generate with Claude (Opus 4.8, structured output) ----
const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string", description: "Human, search-friendly post title (not a keyword string). ~50-65 chars." },
    metaDescription: { type: "string", description: "SEO meta description, 150-160 chars, compelling and specific." },
    slug: { type: "string", description: "url slug, lowercase-hyphenated, no dates" },
    tags: { type: "array", items: { type: "string" }, description: "3-5 meaningful tags (e.g. scripture book, series, topic). NOT a list of cities." },
    bodyHtml: { type: "string", description: "The post body as clean HTML (h2/h3/p/blockquote/ul). Includes the video embed near the top and internal-link CTAs near the end." },
  },
  required: ["title", "metaDescription", "slug", "tags", "bodyHtml"],
};

const SYSTEM = `You are the content writer for Arroyo Church, a non-denominational, Bible-teaching church in Livermore, CA (Tri-Valley, San Francisco Bay Area). Mission: "to know and show the love of Jesus." You turn a Sunday sermon transcript into a genuinely useful blog post that helps real readers AND ranks well for local search — WITHOUT keyword stuffing or thin/duplicate content (Google penalizes that).

Write a post that:
- Opens with a strong, human hook drawn from the sermon (an illustration or the central question), then states the main idea.
- Gives an ORIGINAL summary and life application in your own words (do NOT paste the transcript; synthesize it). ~600-900 words.
- Cites the specific scripture passages the sermon covered, quoted accurately.
- Includes a short closing "takeaway" or reflection question.
- Embeds the sermon video near the top using EXACTLY this markup (real id substituted): <div class="sermon-embed" style="position:relative;padding-bottom:56.25%;height:0;margin:1.5rem 0;border-radius:14px;overflow:hidden"><iframe src="https://www.youtube.com/embed/VIDEO_ID" title="Watch the sermon" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen loading="lazy"></iframe></div>
- Mentions Livermore / the Tri-Valley ONCE, naturally, in a closing invitation — never sprinkled through the body.
- Ends with two internal-link CTAs: <a href="/messages">Watch more sermons</a> and <a href="/plan-your-visit">Plan your visit</a>.
- bodyHtml uses semantic tags (h2, h3, p, blockquote, ul/li). No <html>/<head>/<body> wrapper, no inline color styles except the embed block above.
Tone: warm, clear, pastoral, never clickbait. Theologically careful — if the transcript is ambiguous on a name or reference, keep it general rather than guessing.`;

const USER = `Sermon to write up:
- Title: ${v.title}
- Series: ${series.title || "(standalone)"}${series.blurb ? " — " + series.blurb : ""}
- YouTube video id: ${v.id}
- Watch URL: ${videoUrl}

Transcript (auto-captions; may misrender names/scripture — correct obvious errors, keep uncertain references general):
"""
${transcript.slice(0, 60000)}
"""

Write the blog post. Substitute the real video id (${v.id}) into the embed markup.`;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const resp = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 8000,
  system: SYSTEM,
  output_config: { format: { type: "json_schema", schema: SCHEMA } },
  messages: [{ role: "user", content: USER }],
});

const textBlock = resp.content.find(b => b.type === "text");
if (!textBlock) { console.error("no text block in response; stop_reason=" + resp.stop_reason); process.exit(1); }
const post = JSON.parse(textBlock.text);

const slug = (post.slug || v.title || "sermon").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const base = `${DRAFTS}/${today}-${slug}`;

writeFileSync(`${base}.json`, JSON.stringify({ ...post, videoId: v.id, videoUrl, series: series.title || null, generated: today }, null, 2) + "\n");
writeFileSync(`${base}.html`,
`<!-- PASTE-READY DRAFT — review, then in Squarespace create a blog post and:
     • Title: ${post.title}
     • SEO Description (Post Settings -> SEO): ${post.metaDescription}
     • URL slug: ${slug}
     • Tags: ${post.tags.join(", ")}
     • Body: paste everything below this comment. -->
${post.bodyHtml}\n`);

console.log(`Wrote ${base}.html / .json — "${post.title}"`);

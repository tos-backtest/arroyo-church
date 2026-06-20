// Auto-sync the latest sermons + podcast episodes from YouTube into data/*.json.
//
// Runs in GitHub Actions (Node 20+). KEY-FREE by default: it reads YouTube's public
// per-playlist RSS feeds (no API key, no quota, no CORS issue server-side). If a
// YT_API_KEY secret is present, it ALSO auto-detects the *newest* series playlist via
// the Data API (so a brand-new sermon series is picked up with zero manual edits).
//
// Failure handling: if a feed is empty or errors, the script exits non-zero WITHOUT
// writing, so the previously-committed JSON (last-good) is preserved.
//
// Config via env (all optional): SERIES_PLAYLIST_ID, PODCAST_PLAYLIST_ID, YT_API_KEY.

import { writeFileSync, mkdirSync } from 'node:fs';

const CHANNEL_ID = 'UCH8pQEu1LJ3INkPyzT4Pndg';                                   // @arroyochurch
const SERIES_PLAYLIST_ID  = process.env.SERIES_PLAYLIST_ID  || 'PLqCyakXjbp1OOesDkGS-yHXk6kpVInzvx';
const PODCAST_PLAYLIST_ID = process.env.PODCAST_PLAYLIST_ID || 'PLqCyakXjbp1M974oafBq-gB2Nywu0liuX';
const API_KEY = process.env.YT_API_KEY || '';
const MAX = 6; // how many videos to carry per section

function decode(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .trim();
}

function parseFeed(xml) {
  // feed-level <title> (the playlist's own title) is the first <title> before any <entry>
  const head = xml.split('<entry>')[0];
  const feedTitle = decode((head.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) {
    const e = m[1];
    const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    if (id && title) entries.push({ id, title: decode(title) });
  }
  return { feedTitle, entries };
}

async function feed(playlistId) {
  const r = await fetch('https://www.youtube.com/feeds/videos.xml?playlist_id=' + playlistId);
  if (!r.ok) throw new Error('RSS ' + r.status + ' for playlist ' + playlistId);
  return parseFeed(await r.text());
}

// Optional: with an API key, pick the most recently-created playlist (= current series).
async function resolveSeriesPlaylistId() {
  if (!API_KEY) return SERIES_PLAYLIST_ID;
  try {
    const url = 'https://www.googleapis.com/youtube/v3/playlists?part=snippet&channelId='
      + CHANNEL_ID + '&maxResults=50&key=' + API_KEY;
    const r = await fetch(url);
    if (!r.ok) return SERIES_PLAYLIST_ID;
    const data = await r.json();
    const exclude = /podcast|worship night|music|shorts|clips|highlights/i;
    const cand = (data.items || [])
      .filter(p => p.id !== PODCAST_PLAYLIST_ID && !exclude.test(p.snippet?.title || ''))
      .sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));
    return cand.length ? cand[0].id : SERIES_PLAYLIST_ID;
  } catch {
    return SERIES_PLAYLIST_ID;
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  // ---- Sermons (current series) ----
  const seriesId = await resolveSeriesPlaylistId();
  const s = await feed(seriesId);
  const [sTitle, ...rest] = (s.feedTitle || '').split(/:\s*/);
  let blurb = rest.join(': ');
  if (blurb && !/[.!?]$/.test(blurb)) blurb += '.';
  const sermons = {
    series: {
      title: sTitle || 'Current Series',
      blurb: blurb || 'A new message every Sunday.',
      playlistUrl: 'https://www.youtube.com/playlist?list=' + seriesId,
    },
    videos: s.entries.slice(0, MAX),
    updated: today,
  };

  // ---- Podcasts ----
  const p = await feed(PODCAST_PLAYLIST_ID);
  const podcasts = {
    playlistUrl: 'https://www.youtube.com/playlist?list=' + PODCAST_PLAYLIST_ID,
    videos: p.entries.slice(0, MAX),
    updated: today,
  };

  if (!sermons.videos.length || !podcasts.videos.length) {
    throw new Error('a feed returned 0 videos — keeping last-good JSON');
  }

  mkdirSync('data', { recursive: true });
  writeFileSync('data/sermons.json', JSON.stringify(sermons, null, 2) + '\n');
  writeFileSync('data/podcasts.json', JSON.stringify(podcasts, null, 2) + '\n');
  console.log(`OK: series="${sermons.series.title}" (${seriesId}) sermons=${sermons.videos.length} podcasts=${podcasts.videos.length}`);
}

main().catch(e => { console.error('sync-youtube failed:', e.message); process.exit(1); });

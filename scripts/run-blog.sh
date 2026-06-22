#!/bin/bash
# Daily sermon-blog runner — invoked by launchd (com.arroyo.blog).
#
# Runs on Dakota's Mac (residential IP) because YouTube blocks yt-dlp transcript
# downloads from datacenter IPs. Runs daily; generate_blog.py targets the LATEST
# sermon and only writes a draft once it's captioned (idempotent: one per sermon),
# then pushes it to GitHub for review/publishing.
#
# API key lives OUTSIDE the repo at ~/.config/arroyo/anthropic.env (chmod 600)
# so it is never committed. Logs go to ~/Library/Logs/arroyo-blog.log.
set -uo pipefail

REPO="/Users/dakotayates/ai-os/ventures/arroyo-church-redesign"
KEY_FILE="$HOME/.config/arroyo/anthropic.env"
LOG="$HOME/Library/Logs/arroyo-blog.log"

# launchd gives a bare PATH; add Python framework (python3 + yt-dlp) and common bins.
export PATH="/Library/Frameworks/Python.framework/Versions/3.13/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

log "=== run start ==="

if [ ! -f "$KEY_FILE" ]; then
  log "ERROR: $KEY_FILE not found. Create it with: ANTHROPIC_API_KEY=sk-ant-... (chmod 600). Aborting."
  exit 1
fi
set -a; . "$KEY_FILE"; set +a
if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  log "ERROR: ANTHROPIC_API_KEY not set in $KEY_FILE. Aborting."
  exit 1
fi

cd "$REPO" || { log "ERROR: cannot cd to $REPO"; exit 1; }

# Refresh latest sermon data (synced daily by the cloud sync-youtube Action) and
# stay rebased so the push at the end is clean.
git pull --rebase --autostash >> "$LOG" 2>&1 || log "WARN: git pull failed (continuing with local data)"

log "generating draft..."
python3 scripts/generate_blog.py >> "$LOG" 2>&1
rc=$?
if [ $rc -ne 0 ]; then
  log "generate_blog.py exited $rc (likely: no new sermon, or transcript not ready yet). Nothing to push."
  log "=== run end ==="
  exit 0
fi

# Push only if a new draft was actually written.
if [ -n "$(git status --porcelain blog-drafts/)" ]; then
  git add blog-drafts/
  git commit -m "Add weekly sermon blog draft" >> "$LOG" 2>&1
  if git push >> "$LOG" 2>&1; then
    log "pushed new draft to GitHub."
  else
    log "ERROR: git push failed — draft committed locally, push it manually."
  fi
else
  log "no new draft this run."
fi

log "=== run end ==="

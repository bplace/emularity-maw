#!/usr/bin/env bash
#
# sync-emularity.sh — copy the DOS "Play in Browser" production file set from
# this fork into the V4 app's public vendor dir.
#
# GitHub (bplace/emularity-maw) is the source of truth. There is no build step:
# the "production script" is just this curated subset of the repo. Run this
# whenever loader.js / emularity-controls.js / emularity-maw.css change, then
# commit the result inside the www/ repo.
#
# Usage:  ./sync-emularity.sh [DEST_DIR]
#         DEST_DIR defaults to ../www/public/vendor/emularity
#
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-$SRC/../www/public/vendor/emularity}"
ENGINE="$SRC/emulators/em-dosbox"

# The uncompressed engine files are git-ignored (generated), so a fresh clone
# from GitHub only carries the git-annex .gz blobs. Materialize + decompress
# them if the plain files are missing. example_maw.html loads the plain .js/.mem.
ensure_engine() {
  local out="$1" gz="$2"
  [ -f "$out" ] && return 0
  if [ ! -e "$gz" ] || [ ! -s "$gz" ]; then
    echo "  git annex get $(basename "$gz")"
    git -C "$SRC" annex get "${gz#"$SRC"/}"
  fi
  echo "  gunzip $(basename "$gz") -> $(basename "$out")"
  gzip -dc "$gz" > "$out"
}

echo "Preparing engine files..."
ensure_engine "$ENGINE/dosbox-sync.js"  "$ENGINE/dosbox-sync.js.gz"
ensure_engine "$ENGINE/dosbox-sync.mem" "$ENGINE/dosbox-sync.mem.gz"

# The curated production set (paths relative to SRC). Keep the layout intact:
# loader.js defaults the splash to logo/maw.png and the play view locates the
# engine under emulators/em-dosbox/.
FILES=(
  es6-promise.js                        # vendored ES6 Promise polyfill
  browserfs.min.js                      # vendored in-browser filesystem
  loader.js                             # MAW fork engine (splash + loading bar)
  emularity-controls.js                 # MAW Start/Stop/Restart/Fullscreen glue
  emularity-maw.css                     # MAW splash + controls theme
  logo/maw.png                          # default splash image
  emulators/em-dosbox/dosbox-sync.js    # EM-DOSBox engine (~5.5 MB)
  emulators/em-dosbox/dosbox-sync.mem   # EM-DOSBox memory image (~319 KB)
)

echo "Syncing -> $DEST"
for f in "${FILES[@]}"; do
  mkdir -p "$DEST/$(dirname "$f")"
  cp "$SRC/$f" "$DEST/$f"
  printf '  %9s  %s\n' "$(wc -c < "$DEST/$f" | tr -d ' ')" "$f"
done

echo "Done. Commit the result under www/public/vendor/emularity/ in the www repo."

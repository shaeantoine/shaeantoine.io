#!/usr/bin/env bash
#
# Compresses the desk's .glb assets for the web.
#
# Why this exists: every model here was exported from Sketchfab with its
# textures as uncompressed PNG, which is how eight props add up to ~60 MB. The
# geometry was never the problem — the worst offender is ~100k triangles, which
# is unremarkable — so this deliberately does NOT simplify meshes. Reducing
# geometry would cost exactly the silhouette detail (bevelled edges catching a
# highlight) that the scene's lighting depends on, to save bytes that aren't
# where the weight is.
#
#   models-src/    pristine exports, never served, the input to this script
#   assets/models/ compressed output, served verbatim by Vite (publicDir)
#
# Re-runnable: sources are only ever copied into models-src if not already
# there, so a second run recompresses from the originals rather than from its
# own lossy output.
#
# Usage:  npm run assets:models
set -euo pipefail

cd "$(dirname "$0")/.."

SRC_DIR="models-src"
OUT_DIR="assets/models"
GLTF_TRANSFORM="npx --yes @gltf-transform/cli@4.5.0"

# Textures are capped rather than left at source resolution: a desk prop covers
# a few hundred pixels at the establishing shot, so 4K maps cost download and
# VRAM for detail no one can see. WebP is chosen over KTX2 because browsers
# decode it natively — KTX2 would cut VRAM further but needs a transcoder and a
# KTX2Loader wired into loaders/gltf.js, which is a separate change.
TEXTURE_SIZE=2048
TEXTURE_FORMAT=webp

mkdir -p "$SRC_DIR"

# ---------------------------------------------------------------------------
# Preserve originals before anything is overwritten
# ---------------------------------------------------------------------------
for model in "$OUT_DIR"/*.glb; do
    [ -e "$model" ] || continue
    name="$(basename "$model")"
    if [ ! -f "$SRC_DIR/$name" ]; then
        echo "  archiving $name -> $SRC_DIR/"
        cp "$model" "$SRC_DIR/$name"
    fi
done

# ---------------------------------------------------------------------------
# Which models are actually referenced
# ---------------------------------------------------------------------------
# Read out of the source rather than hardcoded, so adding a prop to
# deskObjects.js is enough to get it compressed. Tests are excluded via `find`
# rather than grep's --exclude, which BSD grep ignores when --include is also
# given — their fixtures name models that were never meant to exist.
referenced="$(find src -name '*.js' ! -name '*.test.js' -print0 \
    | xargs -0 grep -ho "/models/[A-Za-z0-9_-]*\.glb" \
    | sed 's|/models/||' | sort -u)"

if [ -z "$referenced" ]; then
    echo "No model references found in src/ — refusing to empty $OUT_DIR." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Compress
# ---------------------------------------------------------------------------
echo
missing=""
for name in $referenced; do
    if [ ! -f "$SRC_DIR/$name" ]; then
        # A placeholder in content shouldn't block the whole pipeline — it's
        # reported at the end instead, where it won't be scrolled past.
        missing="$missing $name"
        continue
    fi
    if [ -f "$OUT_DIR/$name" ] && [ "$OUT_DIR/$name" -nt "$SRC_DIR/$name" ]; then
        echo "  up to date   $name"
        continue
    fi
    echo "  compressing  $name"
    $GLTF_TRANSFORM optimize "$SRC_DIR/$name" "$OUT_DIR/$name" \
        --compress meshopt \
        --texture-compress "$TEXTURE_FORMAT" \
        --texture-size "$TEXTURE_SIZE" \
        --simplify false \
        >/dev/null 2>&1
done

# ---------------------------------------------------------------------------
# Drop anything the site doesn't load
# ---------------------------------------------------------------------------
# Vite's publicDir copies assets/ verbatim, so an unreferenced .glb left here is
# shipped to every visitor for nothing. Only removed once the original is
# confirmed safe in models-src.
echo
for model in "$OUT_DIR"/*.glb; do
    [ -e "$model" ] || continue
    name="$(basename "$model")"
    if ! echo "$referenced" | grep -qx "$name"; then
        if [ -f "$SRC_DIR/$name" ]; then
            echo "  unreferenced, removing from $OUT_DIR (kept in $SRC_DIR): $name"
            rm "$model"
        else
            echo "  unreferenced but NOT archived, leaving in place: $name" >&2
        fi
    fi
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
echo
printf '%-32s %12s %12s\n' "MODEL" "BEFORE" "AFTER"
for name in $referenced; do
    [ -f "$OUT_DIR/$name" ] || continue
    printf '%-32s %12s %12s\n' "$name" \
        "$(du -h "$SRC_DIR/$name" | cut -f1)" \
        "$(du -h "$OUT_DIR/$name" | cut -f1)"
done
echo
printf '%-32s %12s %12s\n' "TOTAL" \
    "$(du -sh "$SRC_DIR" | cut -f1)" \
    "$(du -ch "$OUT_DIR"/*.glb | tail -1 | cut -f1)"

if [ -n "$missing" ]; then
    echo
    echo "REFERENCED BUT MISSING from $SRC_DIR/ — these will 404 at runtime:" >&2
    for name in $missing; do echo "  · $name" >&2; done
fi

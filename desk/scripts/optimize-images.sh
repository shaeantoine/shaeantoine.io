#!/usr/bin/env bash
#
# Compresses the desk's still images — the wall art and the room's PBR surface
# sets — for the web.
#
# Why this exists: the art was dropped in at whatever size it was found at
# (hunting.jpg is 2409x3000 and 3.6 MB, for a poster that covers about 90 CSS px
# at the establishing shot) and the surface sets are ambientCG's 2K-JPG zips
# used verbatim, which is seven files and 27 MB. Together that is ~34 MB of
# images against 4.5 MB of geometry — so the images, not the models, are what
# decide how long the room takes to appear.
#
#   art-src/          pristine artwork, never served, the input to this script
#   textures-src/     pristine ambientCG sets, never served
#   assets/art/       compressed output, served verbatim by Vite (publicDir)
#   assets/textures/  compressed output
#
# WebP rather than smaller JPEG, for the same reason optimize-models.sh picks
# it for the model textures: browsers decode it natively, and its chroma
# handling is the difference between a usable and an unusable normal map. A
# JPEG normal map is chroma-subsampled, and since a tangent-space normal is
# *stored in the chroma channels*, that subsampling lands directly on the
# surface's lighting as soft blotching under a raking light.
#
# Re-runnable: sources are only ever copied into the -src directories if not
# already there, so a second run recompresses from the originals rather than
# from its own lossy output.
#
# Usage:  npm run assets:images
set -euo pipefail

cd "$(dirname "$0")/.."

ART_SRC="art-src"
ART_OUT="assets/art"
TEX_SRC="textures-src"
TEX_OUT="assets/textures"

# Both capped at 1024 on the long edge, for different reasons that happen to
# land on the same number.
#
# ART: the largest poster on the wall is 1.4 world units tall and the
# establishing shot's frame is ~3.2 units at that depth, so it covers about an
# eighth of the viewport height — 135 px on a 1080p window, 270 at 2x. 1024
# leaves room for a future closer shot and is still 8x more than is sampled
# today.
#
# SURFACES: these tile, so what matters is texels per metre rather than per
# screen. The carpet tiles every 0.5 m and the plaster every 1.5 m (see
# surfaces.js), which at 1024 is 2048 and 683 texels/m respectively — both
# well past what a floor seen at a grazing angle or a wall lit head-on can
# resolve.
ART_MAX=1024
TEX_MAX=1024

ART_QUALITY=82
TEX_QUALITY=86
# Normal maps carry geometry rather than colour, so they get the same treatment
# a photograph would not need: a higher quality floor, because banding in a
# normal map is not a soft artifact in the image, it is a visible facet in the
# lighting.
NORMAL_QUALITY=93

mkdir -p "$ART_SRC" "$TEX_SRC"

if ! command -v cwebp >/dev/null 2>&1; then
    echo "cwebp not found — install it with: brew install webp" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Preserve originals before anything is overwritten
# ---------------------------------------------------------------------------
archive() {
    local file="$1" dest="$2"
    local name; name="$(basename "$file")"
    if [ ! -f "$dest/$name" ]; then
        echo "  archiving $name -> $dest/"
        mkdir -p "$dest"
        cp "$file" "$dest/$name"
    fi
}

for file in "$ART_OUT"/*.jpg "$ART_OUT"/*.jpeg "$ART_OUT"/*.png; do
    [ -e "$file" ] || continue
    archive "$file" "$ART_SRC"
done

for dir in "$TEX_OUT"/*/; do
    [ -d "$dir" ] || continue
    set_name="$(basename "$dir")"
    for file in "$dir"*.jpg "$dir"*.jpeg "$dir"*.png; do
        [ -e "$file" ] || continue
        archive "$file" "$TEX_SRC/$set_name"
    done
done

# ---------------------------------------------------------------------------
# Encode
# ---------------------------------------------------------------------------
# Caps the LONG edge at `max` and preserves aspect exactly — cwebp's -resize
# derives the other dimension itself when given 0, which is what keeps the
# posters' pinned aspect ratios (see deskObjects.test.js) true of the served
# file and not only of the source.
encode() {
    local src="$1" out="$2" max="$3" quality="$4"

    local width height
    read -r width height <<<"$(sips -g pixelWidth -g pixelHeight "$src" \
        | awk '/pixelWidth/{w=$2} /pixelHeight/{h=$2} END{print w, h}')"

    local resize=()
    if [ "$width" -ge "$height" ] && [ "$width" -gt "$max" ]; then
        resize=(-resize "$max" 0)
    elif [ "$height" -gt "$width" ] && [ "$height" -gt "$max" ]; then
        resize=(-resize 0 "$max")
    fi

    mkdir -p "$(dirname "$out")"
    # -sharp_yuv costs encode time and buys back most of the colour bleed that
    # 4:2:0 subsampling puts on hard edges, which on a poster is its lettering.
    # The `${x[@]+...}` dance is because `set -u` treats an empty array as unset
    # under the bash 3.2 that ships with macOS.
    cwebp -quiet -q "$quality" -sharp_yuv ${resize[@]+"${resize[@]}"} "$src" -o "$out"
}

# The quality floor for a given map, by ambientCG's own filenames.
quality_for() {
    case "$(basename "$1")" in
        NormalGL.*|NormalDX.*) echo "$NORMAL_QUALITY" ;;
        *) echo "$TEX_QUALITY" ;;
    esac
}

# ---------------------------------------------------------------------------
# Which art is actually referenced
# ---------------------------------------------------------------------------
# Vite's publicDir copies assets/ verbatim, so every uncompressed original left
# behind — and every poster that has since been swapped out — is shipped to
# each visitor for nothing. Read out of the source rather than hardcoded, so
# swapping a poster in deskObjects.js is enough to change what gets built.
#
# Resolved before encoding rather than after, so a retired poster is skipped
# instead of being encoded and then deleted on every single run. The surface
# sets are not filtered this way: which maps a material uses is decided inside
# surfaces.js from filenames it builds at runtime, so there is no reference to
# grep for.
referenced="$(find src -name '*.js' ! -name '*.test.js' -print0 \
    | xargs -0 grep -ho "/art/[A-Za-z0-9_-]*\.[a-z]*" \
    | sed 's|/art/||' | sort -u)"

if [ -z "$referenced" ]; then
    echo "No art references found in src/ — refusing to empty $ART_OUT." >&2
    exit 1
fi

echo
for src in "$ART_SRC"/*; do
    [ -f "$src" ] || continue
    name="$(basename "${src%.*}")"
    out="$ART_OUT/$name.webp"
    if ! echo "$referenced" | grep -qx "$name.webp"; then
        echo "  unreferenced, skipping  art/$name"
        continue
    fi
    if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
        echo "  up to date   art/$name.webp"
        continue
    fi
    echo "  encoding     art/$name.webp"
    encode "$src" "$out" "$ART_MAX" "$ART_QUALITY"
done

for dir in "$TEX_SRC"/*/; do
    [ -d "$dir" ] || continue
    set_name="$(basename "$dir")"
    for src in "$dir"*; do
        [ -f "$src" ] || continue
        name="$(basename "${src%.*}")"
        out="$TEX_OUT/$set_name/$name.webp"
        if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
            echo "  up to date   textures/$set_name/$name.webp"
            continue
        fi
        echo "  encoding     textures/$set_name/$name.webp"
        encode "$src" "$out" "$TEX_MAX" "$(quality_for "$src")"
    done
done

# ---------------------------------------------------------------------------
# Drop anything the site doesn't load
# ---------------------------------------------------------------------------
# Only ever removed once the original is confirmed safe in art-src/ or
# textures-src/ — the same rule optimize-models.sh follows.
echo
for file in "$ART_OUT"/*; do
    [ -e "$file" ] || continue
    name="$(basename "$file")"
    if ! echo "$referenced" | grep -qx "$name"; then
        if [ -f "$ART_SRC/$name" ] || [ -f "$ART_SRC/${name%.*}.jpg" ] \
            || [ -f "$ART_SRC/${name%.*}.jpeg" ] || [ -f "$ART_SRC/${name%.*}.png" ]; then
            echo "  unreferenced, removing from $ART_OUT (kept in $ART_SRC): $name"
            rm "$file"
        else
            echo "  unreferenced but NOT archived, leaving in place: $name" >&2
        fi
    fi
done

for dir in "$TEX_OUT"/*/; do
    [ -d "$dir" ] || continue
    set_name="$(basename "$dir")"
    for file in "$dir"*; do
        [ -e "$file" ] || continue
        name="$(basename "$file")"
        case "$name" in
            *.webp) continue ;;
        esac
        if [ -f "$TEX_SRC/$set_name/$name" ]; then
            echo "  superseded, removing from $TEX_OUT/$set_name (kept in $TEX_SRC): $name"
            rm "$file"
        else
            echo "  superseded but NOT archived, leaving in place: $set_name/$name" >&2
        fi
    done
done

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
echo
printf '%-40s %12s %12s\n' "IMAGE" "BEFORE" "AFTER"
for out in "$ART_OUT"/*.webp "$TEX_OUT"/*/*.webp; do
    [ -e "$out" ] || continue
    name="$(basename "${out%.*}")"
    case "$out" in
        "$ART_OUT"/*) src_dir="$ART_SRC" label="art/$name" ;;
        *) set_name="$(basename "$(dirname "$out")")"; src_dir="$TEX_SRC/$set_name"; label="$set_name/$name" ;;
    esac
    src="$(find "$src_dir" -maxdepth 1 -name "$name.*" ! -name '*.webp' | head -1)"
    [ -n "$src" ] || continue
    printf '%-40s %12s %12s\n' "$label" "$(du -h "$src" | cut -f1)" "$(du -h "$out" | cut -f1)"
done

echo
printf '%-40s %12s %12s\n' "TOTAL" \
    "$(du -sch "$ART_SRC" "$TEX_SRC" | tail -1 | cut -f1)" \
    "$(du -sch "$ART_OUT" "$TEX_OUT" | tail -1 | cut -f1)"

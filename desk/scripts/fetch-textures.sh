#!/usr/bin/env bash
#
# Downloads CC0 PBR material sets from ambientCG into desk/assets/textures/,
# where src/scene/surfaces.js expects them.
#
#   ./scripts/fetch-textures.sh carpet Carpet013
#   ./scripts/fetch-textures.sh plaster PaintedPlaster017
#
# Browse and pick IDs at https://ambientcg.com/list?type=Material — search
# "carpet" and "painted plaster". The ID is the last path segment of the asset
# URL, e.g. ambientcg.com/view?id=Carpet013 -> Carpet013. IDs are not
# guessable, so this script takes one rather than hardcoding a choice.
#
# Afterwards, point surfaces.js at the result:
#
#   export const SURFACE_SOURCES = {
#       carpet: '/textures/carpet',
#       plaster: '/textures/plaster'
#   };
#
set -euo pipefail

if [ $# -ne 2 ]; then
    echo "usage: $0 <carpet|plaster> <ambientCG-asset-id>" >&2
    exit 64
fi

slot="$1"
asset="$2"
resolution="2K-JPG"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$repo_root/assets/textures/$slot"
archive="$(mktemp -t "${asset}.XXXXXX.zip")"
staging="$(mktemp -d)"
trap 'rm -rf "$archive" "$staging"' EXIT

echo "Downloading ${asset}_${resolution} from ambientCG..."
curl -fL --progress-bar \
    -o "$archive" \
    "https://ambientcg.com/get?file=${asset}_${resolution}.zip"

unzip -q -o "$archive" -d "$staging"

# ambientCG prefixes every file with the asset id and resolution
# (Carpet013_2K-JPG_Color.jpg). surfaces.js wants the bare map names, and
# specifically NormalGL rather than NormalDX — three.js uses OpenGL-convention
# normals, where green points up.
mkdir -p "$dest"
missing=0
for map in Color NormalGL Roughness AmbientOcclusion; do
    src="$staging/${asset}_${resolution}_${map}.jpg"
    if [ -f "$src" ]; then
        cp "$src" "$dest/${map}.jpg"
        echo "  ${map}.jpg"
    else
        echo "  !! ${map}.jpg missing from this asset" >&2
        missing=1
    fi
done

if [ "$missing" -ne 0 ]; then
    echo >&2
    echo "Some maps were absent — this asset may not ship a full PBR set." >&2
    echo "Contents of the archive:" >&2
    ls "$staging" >&2
    exit 1
fi

echo
echo "Wrote $dest"
echo "Now set SURFACE_SOURCES.$slot = '/textures/$slot' in src/scene/surfaces.js"

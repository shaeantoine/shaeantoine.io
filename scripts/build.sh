#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

rm -rf .build
mkdir -p .build/site
cp -R site/. .build/site/

cd homepage
npm ci
npm run build

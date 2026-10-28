#!/usr/bin/env bash
set -euo pipefail
node scripts/embed-assets.mjs
rm -rf dist
mkdir -p dist/server
cp worker/index.js dist/server/index.js
if [ -f .openai/hosting.json ]; then
  mkdir -p dist/.openai
  cp .openai/hosting.json dist/.openai/hosting.json
fi

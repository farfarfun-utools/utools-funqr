#!/bin/sh
set -eu
cd "$(dirname "$0")"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
NODE_OPTIONS=--experimental-webstorage pnpm test
pnpm build
node --check utools/preload.js
node -e 'const fs = require("node:fs"); const p = JSON.parse(fs.readFileSync("utools/plugin.json", "utf8")); if (p.version !== require("./package.json").version) throw new Error("Version mismatch"); for (const file of [p.main, p.logo, p.preload]) { if (!fs.existsSync("utools/" + file)) throw new Error("Missing " + file) }'
echo 'uTools plugin ready: utools/plugin.json'

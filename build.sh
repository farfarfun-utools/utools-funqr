#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

command -v node >/dev/null || { echo "error: Node.js is required" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "error: pnpm is required (corepack enable)" >&2; exit 1; }

node -e '
const want = (require("./package.json").engines || {}).node || "";
const match = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(want.trim());
if (!match) {
  console.error(`error: package.json#engines.node must match >=x.y.z, got "${want}"`);
  process.exit(2);
}
const need = match.slice(1).map(Number);
const have = process.versions.node.split(".").map(Number);
const diff = need.map((n, i) => have[i] - n).find((d) => d !== 0) || 0;
if (diff < 0) {
  console.error(`error: Node ${want} is required, found ${process.versions.node}`);
  process.exit(1);
}
'

pnpm install --frozen-lockfile
if [ "${SKIP_CHECKS:-0}" = "1" ]; then
  echo "SKIP_CHECKS=1: skipping typecheck / test"
else
  pnpm typecheck
  pnpm test
  NODE_OPTIONS=--experimental-webstorage pnpm test
fi
pnpm build
node --check utools/preload.js
node -e 'const fs = require("node:fs"); const p = JSON.parse(fs.readFileSync("utools/plugin.json", "utf8")); if (p.version !== require("./package.json").version) throw new Error("Version mismatch"); for (const file of [p.main, p.logo, p.preload]) { if (!fs.existsSync("utools/" + file)) throw new Error("Missing " + file) }'
test ! -e utools/.git || { echo "error: utools/ 内不应存在 .git" >&2; exit 1; }
echo 'uTools plugin ready: utools/plugin.json'

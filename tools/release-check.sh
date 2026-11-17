#!/usr/bin/env bash
# Release gates for pf15-discovery-veil (0.7.8, D-7; ported from pf15-identity-mask 0.8.4). Run by release.yml.
#   tools/release-check.sh <version>     before the build: tag/version, syntax, tests, download URL
#   tools/release-check.sh --zip <file>  after the build: zip carries the module folder
set -euo pipefail

fail() { echo "release-check: $*" >&2; exit 1; }

if [ "${1:-}" = "--zip" ]; then
  zip="${2:?usage: release-check.sh --zip <file>}"
  [ -f "$zip" ] || fail "no such zip: $zip"
  list=$(unzip -l "$zip") || fail "cannot read $zip"
  for f in pf15-discovery-veil/module.json pf15-discovery-veil/scripts/main.mjs; do
    grep -qE "[[:space:]]${f}\$" <<<"$list" || fail "$zip is missing $f"
  done
  echo "release-check: zip OK"
  exit 0
fi

want="${1:?usage: release-check.sh <version> | --zip <file>}"
cd "$(dirname "$0")/.."

have=$(node -p "require('./module.json').version")
[ "$have" = "$want" ] || fail "module.json version $have does not match tag $want"

for f in scripts/*.mjs; do
  node --check "$f" || fail "syntax error in $f"
done

node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8'))" || fail "lang/en.json does not parse"

node --test "tests/*.test.mjs" || fail "unit tests failed"

dl=$(node -p "require('./module.json').download")
case "$dl" in
  */pf15-discovery-veil.zip) ;;
  *) fail "module.json download does not end in /pf15-discovery-veil.zip: $dl" ;;
esac

echo "release-check: $want OK"

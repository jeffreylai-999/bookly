#!/usr/bin/env bash
# Idempotent Cloud Agent install: satisfy Angular 22's Node engines, then install deps.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
PNPM_VERSION="$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' package.json | head -n1)"
PNPM_VERSION="${PNPM_VERSION:-10.11.0}"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "nvm is required in the Cloud Agent base image but was not found at $NVM_DIR/nvm.sh" >&2
  exit 1
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

nvm install "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
nvm use "$NODE_VERSION"

# Resolve the installed bin dir directly. Do not use `command -v node` here:
# Cloud Agent PATH puts /exec-daemon ahead of nvm, and `nvm use` only rewrites
# the existing nvm segment in place (it does not move it before /exec-daemon).
NODE_BIN_DIR="$NVM_DIR/versions/node/v${NODE_VERSION}/bin"
if [[ ! -x "$NODE_BIN_DIR/node" ]]; then
  echo "Expected Node binary missing at $NODE_BIN_DIR/node" >&2
  exit 1
fi
export PATH="$NODE_BIN_DIR:$PATH"
hash -r

corepack enable
corepack prepare "pnpm@${PNPM_VERSION}" --activate
hash -r

# Persist that preference for later agent shells: /usr/local/cargo/bin precedes
# /exec-daemon on the Cloud Agent PATH.
CARGO_BIN="${CARGO_HOME:-/usr/local/cargo}/bin"
if [[ -d "$CARGO_BIN" && -w "$CARGO_BIN" ]]; then
  for cmd in node npm npx corepack pnpm pnpx; do
    if [[ -x "$NODE_BIN_DIR/$cmd" ]]; then
      ln -sfn "$NODE_BIN_DIR/$cmd" "$CARGO_BIN/$cmd"
    fi
  done
fi
hash -r

echo "Using $(command -v node) ($(node -v)); $(command -v pnpm) ($(pnpm -v))"

pnpm install

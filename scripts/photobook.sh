#!/bin/sh
# Runs the photobook engine on Mac and Linux:  sh photobook.sh <command> [options]
# First use only: fetches a private copy of Node.js (official build from nodejs.org, checksum-checked) into
# ~/.photobook-maker/node and installs the engine's parts. No admin password, no installer, nothing else on the
# computer changes. Delete that folder to remove it again.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENGINE="$ROOT/engine"
PB_HOME="${PHOTOBOOK_HOME:-$HOME/.photobook-maker}"
NODEDIR="$PB_HOME/node"
LINE=latest-v24.x
say() { echo "[photobook] $*" >&2; }
fail() { say "ERROR: $*"; exit 1; }

if [ ! -x "$NODEDIR/bin/node" ]; then
  case "$(uname -s)" in Darwin) OS=darwin ;; Linux) OS=linux ;; *) fail "unsupported system $(uname -s)" ;; esac
  case "$(uname -m)" in arm64 | aarch64) ARCH=arm64 ;; x86_64 | amd64) ARCH=x64 ;; *) fail "unsupported processor $(uname -m)" ;; esac
  TMPD="$PB_HOME/download"
  rm -rf "$TMPD"; mkdir -p "$TMPD"
  say "Getting Node.js (official build from nodejs.org, about 50 MB, only once)..."
  curl -fsSL "https://nodejs.org/dist/$LINE/SHASUMS256.txt" -o "$TMPD/SHASUMS256.txt" || fail "could not download Node.js from nodejs.org. Check the internet connection and try again."
  ENTRY=$(grep -- "-$OS-$ARCH.tar.gz" "$TMPD/SHASUMS256.txt" | head -1)
  [ -n "$ENTRY" ] || fail "no Node.js build found for $OS-$ARCH"
  SUM=${ENTRY%% *}
  FILE=${ENTRY##* }
  curl -fsSL "https://nodejs.org/dist/$LINE/$FILE" -o "$TMPD/$FILE" || fail "could not download Node.js. Check the internet connection and try again."
  if command -v shasum >/dev/null 2>&1; then GOT=$(shasum -a 256 "$TMPD/$FILE" | cut -d' ' -f1); else GOT=$(sha256sum "$TMPD/$FILE" | cut -d' ' -f1); fi
  [ "$GOT" = "$SUM" ] || fail "the Node.js download is damaged (checksum mismatch). Try again later."
  tar -xzf "$TMPD/$FILE" -C "$TMPD"
  mv "$TMPD/${FILE%.tar.gz}" "$NODEDIR"
  rm -rf "$TMPD"
  say "Node.js is ready."
fi

export PATH="$NODEDIR/bin:$PATH"
if [ ! -f "$ENGINE/node_modules/sharp/package.json" ] || [ ! -f "$ENGINE/node_modules/mupdf/package.json" ]; then
  say "Installing the engine parts (about a minute, only once)..."
  (cd "$ENGINE" && npm ci --omit=dev --no-audit --no-fund --loglevel=error) >&2 || fail "installing the engine parts failed. Check the internet connection and try again."
fi
exec "$NODEDIR/bin/node" "$ENGINE/bin/photobook.mjs" "$@"

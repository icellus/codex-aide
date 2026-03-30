#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(pwd)"

copy_tree() {
  local src_dir="$1"
  local dst_dir="$2"

  mkdir -p "$dst_dir"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$src_dir"/ "$dst_dir"/
  else
    cp -a "$src_dir"/. "$dst_dir"/
  fi
}

if [[ "$SOURCE_DIR" == "$TARGET_DIR" ]]; then
  printf '%s\n' "Run install.sh from the target repository root, not from codex-starter itself." >&2
  exit 1
fi

rm -f -- "$TARGET_DIR/AGENTS.md"
rm -rf -- "$TARGET_DIR/.codex" "$TARGET_DIR/.agents" "$TARGET_DIR/.product"

cp -f "$SOURCE_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
copy_tree "$SOURCE_DIR/.codex" "$TARGET_DIR/.codex"

printf '%s\n' "Installed codex-starter into $TARGET_DIR"

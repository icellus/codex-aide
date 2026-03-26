#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$(pwd)"

copy_dir() {
  local src_dir="$1"
  local dst_dir="$2"

  if [[ -e "$dst_dir" && ! -d "$dst_dir" ]]; then
    rm -rf -- "$dst_dir"
  fi

  mkdir -p "$dst_dir"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$src_dir"/ "$dst_dir"/
  else
    rm -rf -- "$dst_dir"
    mkdir -p "$dst_dir"
    cp -a "$src_dir"/. "$dst_dir"/
  fi
}

copy_file() {
  local src_file="$1"
  local dst_file="$2"

  mkdir -p "$(dirname "$dst_file")"
  cp -f "$src_file" "$dst_file"
}

append_gitignore_lines() {
  local gitignore_path="$1"
  shift

  local missing=()
  local line

  if [[ ! -f "$gitignore_path" ]]; then
    : > "$gitignore_path"
  fi

  for line in "$@"; do
    if ! grep -Fqx "$line" "$gitignore_path"; then
      missing+=("$line")
    fi
  done

  if [[ "${#missing[@]}" -eq 0 ]]; then
    return
  fi

  if [[ -s "$gitignore_path" ]]; then
    printf '\n' >> "$gitignore_path"
  fi

  if ! grep -Fqx "# codex-starter" "$gitignore_path"; then
    printf '%s\n' "# codex-starter" >> "$gitignore_path"
  fi

  printf '%s\n' "${missing[@]}" >> "$gitignore_path"
}

copy_file "$SOURCE_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
copy_dir "$SOURCE_DIR/.agents" "$TARGET_DIR/.agents"
copy_dir "$SOURCE_DIR/.codex" "$TARGET_DIR/.codex"
copy_dir "$SOURCE_DIR/.product" "$TARGET_DIR/.product"

append_gitignore_lines \
  "$TARGET_DIR/.gitignore" \
  "AGENTS.md" \
  ".agents/" \
  ".codex/" \
  ".product/"

printf '%s\n' "Installed codex-starter files into $TARGET_DIR"

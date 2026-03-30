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

copy_file_if_missing() {
  local src_file="$1"
  local dst_file="$2"

  mkdir -p "$(dirname "$dst_file")"
  if [[ ! -e "$dst_file" ]]; then
    cp -f "$src_file" "$dst_file"
  fi
}

copy_dir_if_missing() {
  local src_dir="$1"
  local dst_dir="$2"

  mkdir -p "$dst_dir"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --ignore-existing "$src_dir"/ "$dst_dir"/
    return
  fi

  local src_path
  while IFS= read -r -d '' src_path; do
    local rel_path="${src_path#$src_dir/}"
    local dst_path="$dst_dir/$rel_path"

    if [[ -d "$src_path" ]]; then
      mkdir -p "$dst_path"
      continue
    fi

    if [[ ! -e "$dst_path" ]]; then
      mkdir -p "$(dirname "$dst_path")"
      cp -a "$src_path" "$dst_path"
    fi
  done < <(find "$src_dir" -mindepth 1 -print0)
}

cleanup_legacy_codex_runtime_artifacts() {
  local dst_dir="$1"

  rm -f -- "$dst_dir/logs/runtime-hooks.jsonl"
}

migrate_legacy_product_dir() {
  local target_dir="$1"
  local legacy_dir="$target_dir/.product"
  local dst_dir="$target_dir/.codex/product"

  if [[ ! -d "$legacy_dir" ]]; then
    return
  fi

  copy_dir_if_missing "$legacy_dir" "$dst_dir"
}

prune_dir_children_except() {
  local dir="$1"
  shift

  mkdir -p "$dir"

  local find_args=("$dir" -mindepth 1 -maxdepth 1)
  local name
  for name in "$@"; do
    find_args+=( ! -name "$name" )
  done
  find_args+=( -exec rm -rf -- {} + )

  find "${find_args[@]}"
}

copy_codex_dir() {
  local src_dir="$1"
  local dst_dir="$2"

  prune_dir_children_except "$dst_dir" "logs" "product" "progress" "state" "settings.local.json"
  cleanup_legacy_codex_runtime_artifacts "$dst_dir"
  mkdir -p "$dst_dir/logs" "$dst_dir/progress" "$dst_dir/state"

  copy_dir "$src_dir/agents" "$dst_dir/agents"
  copy_dir "$src_dir/defaults" "$dst_dir/defaults"
  copy_dir "$src_dir/hooks" "$dst_dir/hooks"
  copy_dir_if_missing "$src_dir/product" "$dst_dir/product"
  copy_dir "$src_dir/scripts" "$dst_dir/scripts"
  copy_dir "$src_dir/skills" "$dst_dir/skills"
  copy_dir "$src_dir/templates" "$dst_dir/templates"

  copy_file "$src_dir/config.toml" "$dst_dir/config.toml"
  copy_file "$src_dir/delivery-policy.json" "$dst_dir/delivery-policy.json"
  copy_file "$src_dir/evolution-policy.json" "$dst_dir/evolution-policy.json"
  copy_file "$src_dir/hooks.json" "$dst_dir/hooks.json"
  copy_file "$src_dir/project-profile.md" "$dst_dir/project-profile.md"
  copy_file "$src_dir/routing-policy.md" "$dst_dir/routing-policy.md"
  copy_file "$src_dir/validation-profile.json" "$dst_dir/validation-profile.json"

  copy_file_if_missing "$src_dir/defaults/state/task-context.json" "$dst_dir/state/task-context.json"
  copy_file_if_missing "$src_dir/defaults/state/repo-context.json" "$dst_dir/state/repo-context.json"
  copy_file_if_missing "$src_dir/defaults/state/task-registry.json" "$dst_dir/state/task-registry.json"
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
migrate_legacy_product_dir "$TARGET_DIR"
copy_codex_dir "$SOURCE_DIR/.codex" "$TARGET_DIR/.codex"

append_gitignore_lines \
  "$TARGET_DIR/.gitignore" \
  ".codex/settings.local.json" \
  ".codex/logs/" \
  ".codex/state/" \
  ".codex/progress/"

printf '%s\n' "Installed codex-starter files into $TARGET_DIR"

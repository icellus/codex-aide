#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
mode="${1:-}"

matches_authority_scope() {
  local file_path="$1"

  case "$file_path" in
    codex-starter/AGENTS.md|\
    codex-starter/.codex/policies/*|\
    codex-starter/.codex/skills/*|\
    codex-starter/.codex/agents/*|\
    codex-starter/.codex/context/*|\
    standards/codex-starter-authority-map.json|\
    scripts/validate-codex-starter-authority.mjs)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

should_run_for_commit() {
  while IFS= read -r file_path; do
    [[ -z "$file_path" ]] && continue
    if matches_authority_scope "$file_path"; then
      return 0
    fi
  done < <(git -C "$repo_root" diff --cached --name-only --diff-filter=ACMR)

  return 1
}

run_validator() {
  echo "Running codex-starter authority validator"
  node "$repo_root/scripts/validate-codex-starter-authority.mjs"
}

case "$mode" in
  pre-commit)
    if should_run_for_commit; then
      run_validator
    fi
    ;;
  pre-push)
    run_validator
    ;;
  *)
    echo "Usage: $0 <pre-commit|pre-push>" >&2
    exit 2
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
mode="${1:-}"

matches_validation_scope() {
  local file_path="$1"

  case "$file_path" in
    codex-starter/AGENTS.md|\
    codex-starter/.codex/*|\
    standards/codex-starter-authority-map.json|\
    standards/codex-starter-consistency-map.json|\
    standards/codex-starter-test-registry.json|\
    fixtures/codex-starter-dev/*|\
    TESTING.md|\
    scripts/validate-codex-starter-authority.mjs|\
    scripts/validate-codex-starter-dev.mjs|\
    scripts/run-codex-starter-dev-validation-hook.sh)
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
    if matches_validation_scope "$file_path"; then
      return 0
    fi
  done < <(git -C "$repo_root" diff --cached --name-only --diff-filter=ACMR)

  return 1
}

run_validator() {
  local profile="$1"
  echo "Running codex-starter development validator ($profile)"
  node "$repo_root/scripts/validate-codex-starter-dev.mjs" "$profile"
}

case "$mode" in
  pre-commit)
    if should_run_for_commit; then
      run_validator contract
    fi
    ;;
  pre-push)
    run_validator full
    ;;
  *)
    echo "Usage: $0 <pre-commit|pre-push>" >&2
    exit 2
    ;;
esac

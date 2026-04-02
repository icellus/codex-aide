#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
mode="${1:-}"

matches_validation_scope() {
  local file_path="$1"

  case "$file_path" in
    codex-aide/AGENTS.md|\
    codex-aide/.codex/*|\
    tests/standards/codex-aide-authority-map.json|\
    tests/standards/codex-aide-consistency-map.json|\
    tests/standards/codex-aide-test-registry.json|\
    tests/fixtures/codex-aide-dev/*|\
    TESTING.md|\
    scripts/validate-codex-aide-authority.mjs|\
    scripts/validate-codex-aide-dev.mjs|\
    scripts/run-codex-aide-dev-validation-hook.sh)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

should_run_for_commit() {
  [[ "$(collect_commit_scope_files | wc -l)" -gt 0 ]]
}

collect_commit_scope_files() {
  git -C "$repo_root" diff --cached --name-only --diff-filter=ACMR | while IFS= read -r file_path; do
    [[ -z "$file_path" ]] && continue
    if matches_validation_scope "$file_path"; then
      printf '%s\n' "$file_path"
    fi
  done | sort -u
}

collect_push_scope_files() {
  while IFS=' ' read -r local_ref local_sha remote_ref remote_sha; do
    [[ -z "${local_sha:-}" ]] && continue

    if [[ "$local_sha" =~ ^0+$ ]]; then
      continue
    fi

    if [[ -n "${remote_sha:-}" && ! "$remote_sha" =~ ^0+$ ]]; then
      git -C "$repo_root" diff --name-only --diff-filter=ACMR "$remote_sha..$local_sha"
      continue
    fi

    git -C "$repo_root" log --format= --name-only --diff-filter=ACMR "$local_sha" --not --remotes
  done | while IFS= read -r file_path; do
    [[ -z "$file_path" ]] && continue
    if matches_validation_scope "$file_path"; then
      printf '%s\n' "$file_path"
    fi
  done | sort -u
}

run_validator() {
  local profile="$1"
  shift
  local cmd=(node "$repo_root/scripts/validate-codex-aide-dev.mjs" "$profile")

  for file_path in "$@"; do
    cmd+=(--changed-file "$file_path")
  done

  echo "Running codex-aide development validator ($profile)"
  "${cmd[@]}"
}

case "$mode" in
  pre-commit)
    if should_run_for_commit; then
      mapfile -t scope_files < <(collect_commit_scope_files)
      run_validator contract "${scope_files[@]}"
    fi
    ;;
  pre-push)
    mapfile -t scope_files < <(collect_push_scope_files)
    if [[ "${#scope_files[@]}" -gt 0 ]]; then
      run_validator full "${scope_files[@]}"
    fi
    ;;
  *)
    echo "Usage: $0 <pre-commit|pre-push>" >&2
    exit 2
    ;;
esac

#!/usr/bin/env node

import { readJsonStdin } from "./runtime-utils.mjs";

function isBroadGitAddCommand(command) {
  const normalized = String(command || "").replace(/\s+/g, " ").trim();
  if (!/\bgit\s+add\b/i.test(normalized)) {
    return false;
  }

  const broadPatterns = [
    /\bgit\s+add\s+\.(?:\s|$)/i,
    /\bgit\s+add\s+-A(?:\s|$)/i,
    /\bgit\s+add\s+--all(?:\s|$)/i,
    /\bgit\s+add\s+-u(?:\s|$)/i,
    /\bgit\s+add\s+--update(?:\s|$)/i,
    /\bgit\s+add\b[\s\S]*\s:\/(?:\s|$)/i,
    /\bgit\s+add\b[\s\S]*\*(?:\s|$)/i
  ];

  return broadPatterns.some((pattern) => pattern.test(normalized));
}

async function main() {
  try {
    const input = await readJsonStdin();
    const command = String(input.command || input.cmd || input.tool_input?.command || "").trim();

    const blocked = isBroadGitAddCommand(command);
    if (!blocked) {
      return;
    }

    process.stdout.write(
      JSON.stringify({
        ok: false,
        code: "broad_git_add_denied",
        message:
          "'git add .' and broad all-file staging are not allowed. Stage specific files or directories instead.",
        examples: ["git add path/to/file.txt", "git add directory/", "git add '*.ts'"]
      }) + "\n"
    );
    process.exit(2);
  } catch (error) {
    process.stderr.write(`validate-git error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

await main();

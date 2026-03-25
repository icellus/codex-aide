#!/usr/bin/env node

import { readJsonStdin } from "./runtime-utils.mjs";

async function main() {
  try {
    const input = await readJsonStdin();
    const command = String(input.command || input.cmd || input.tool_input?.command || "").trim();

    const blockedPatterns = [
      /\bgit\s+add\s+\.$/i,
      /\bgit\s+add\s+\.\s/i,
      /\bgit\s+add\s+-A\b/i,
      /\bgit\s+add\s+--all\b/i
    ];

    const blocked = blockedPatterns.some((pattern) => pattern.test(command));
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

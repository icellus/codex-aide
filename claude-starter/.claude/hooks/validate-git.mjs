#!/usr/bin/env node

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});

process.stdin.on("end", () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const command = String(input.tool_input?.command || "");

    const blockedPatterns = [
      /\bgit\s+add\s+\.$/i,
      /\bgit\s+add\s+\.\s/i,
      /\bgit\s+add\s+-A\b/i,
      /\bgit\s+add\s+--all\b/i
    ];

    const blocked = blockedPatterns.some((pattern) => pattern.test(command));
    if (!blocked) {
      process.exit(0);
    }

    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "❌ BLOCKED: 'git add .' and 'git add -A' are not allowed.\n" +
          "Please add specific files instead:\n" +
          "  • git add path/to/file.txt\n" +
          "  • git add *.py\n" +
          "  • git add directory/\n" +
          "This prevents accidentally committing sensitive files or unintended changes."
      }
    };

    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          error: `Hook validation error: ${error instanceof Error ? error.message : String(error)}`
        }
      }) + "\n"
    );
    process.exit(0);
  }
});

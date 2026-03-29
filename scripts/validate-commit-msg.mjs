#!/usr/bin/env node

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { validateCommitMessage } from "./commit-policy.mjs";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function validateSingleMessage(message, label = "commit message") {
  const result = validateCommitMessage(message);
  if (result.ok) {
    return;
  }

  process.stderr.write(`Invalid ${label}: ${result.subject || "<empty>"}\n`);
  result.errors.forEach((error) => process.stderr.write(`- ${error}\n`));
  process.stderr.write("\nExpected examples:\n");
  process.stderr.write("- feat: add commit policy validation\n");
  process.stderr.write("- fix(tests): split oversized smoke coverage\n");
  process.stderr.write("- docs(readme): document hook setup\n");
  process.exit(1);
}

function validateRange(range) {
  const output = execFileSync("git", ["log", "--format=%H%x00%s", range], {
    encoding: "utf8"
  });

  const invalid = output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, subject] = line.split("\u0000");
      return {
        hash,
        result: validateCommitMessage(subject)
      };
    })
    .filter((entry) => !entry.result.ok);

  if (invalid.length === 0) {
    return;
  }

  process.stderr.write(`Invalid commit messages in range ${range}:\n`);
  invalid.forEach((entry) => {
    process.stderr.write(`- ${entry.hash.slice(0, 12)} ${entry.result.subject || "<empty>"}\n`);
    entry.result.errors.forEach((error) => process.stderr.write(`  - ${error}\n`));
  });
  process.exit(1);
}

function main(argv) {
  if (argv.length === 2 && argv[0] === "--range") {
    validateRange(argv[1]);
    return;
  }

  if (argv.length === 2 && argv[0] === "--message") {
    validateSingleMessage(argv[1], "commit message");
    return;
  }

  if (argv.length === 1) {
    const filePath = argv[0];
    const message = fs.readFileSync(filePath, "utf8");
    validateSingleMessage(message, filePath);
    return;
  }

  fail("Usage: node scripts/validate-commit-msg.mjs <commit-msg-file> | --message <text> | --range <git-range>");
}

main(process.argv.slice(2));

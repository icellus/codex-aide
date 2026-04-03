#!/usr/bin/env node

import path from "node:path";

import { installRuntime } from "../scripts/npm/install.mjs";

function usage() {
  return `code-aide

Usage:
  code-aide install [--target <dir>] [--dry-run]
  code-aide --help
  code-aide --version
`;
}

function parseArgs(argv) {
  const args = [...argv];
  const firstArg = args[0] || "";
  if (firstArg === "--help" || firstArg === "-h") {
    return {
      command: "help",
      options: {
        targetDir: process.cwd(),
        force: false,
        dryRun: false
      }
    };
  }

  if (firstArg === "--version" || firstArg === "-v") {
    return {
      command: "version",
      options: {
        targetDir: process.cwd(),
        force: false,
        dryRun: false
      }
    };
  }

  const command = args.shift() || "";
  const options = {
    targetDir: process.cwd(),
    dryRun: false
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--help" || arg === "-h") {
      return {
        command: "help",
        options
      };
    }

    if (arg === "--version" || arg === "-v") {
      return {
        command: "version",
        options
      };
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--target") {
      const value = args.shift();
      if (!value) {
        throw new Error("--target requires a directory");
      }
      options.targetDir = path.resolve(value);
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return {
    command,
    options
  };
}

async function main(argv = process.argv.slice(2)) {
  let parsed;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}`);
    return 2;
  }

  if (parsed.command === "help" || !parsed.command) {
    process.stdout.write(usage());
    return 0;
  }

  if (parsed.command === "version") {
    process.stdout.write("0.1.1\n");
    return 0;
  }

  if (parsed.command !== "install") {
    process.stderr.write(`unknown command: ${parsed.command}\n\n${usage()}`);
    return 2;
  }

  try {
    const result = installRuntime(parsed.options);
    process.stdout.write(`${result.summary}\n`);
    for (const line of result.details) {
      process.stdout.write(`${line}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

process.exit(await main());

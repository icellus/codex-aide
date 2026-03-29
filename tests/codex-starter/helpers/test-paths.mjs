import path from "node:path";
import { fileURLToPath } from "node:url";

const helperFilePath = fileURLToPath(import.meta.url);
const helperDir = path.dirname(helperFilePath);

export const repoRootDir = path.resolve(helperDir, "..", "..", "..");
export const starterRootDir = path.join(repoRootDir, "codex-starter");

export function isDirectRun(metaUrl) {
  const filePath = fileURLToPath(metaUrl);
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === filePath;
}


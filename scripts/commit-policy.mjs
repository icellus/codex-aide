const allowedTypes = ["feat", "fix", "refactor", "docs", "test", "chore", "ci", "build", "perf", "revert"];

const conventionalPattern = new RegExp(
  `^(?<type>${allowedTypes.join("|")})(?:\\((?<scope>[a-z0-9][a-z0-9._/-]*)\\))?: (?<subject>.+)$`
);

function extractSubject(message) {
  const lines = String(message ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim());

  return lines.find((line) => line && !line.startsWith("#")) || "";
}

function validateCommitMessage(message) {
  const subject = extractSubject(message);
  const errors = [];

  if (!subject) {
    errors.push("commit subject cannot be empty");
    return { ok: false, subject, errors };
  }

  if (/^Merge\b/.test(subject) || /^Revert\b/.test(subject)) {
    return { ok: true, subject, errors };
  }

  const match = subject.match(conventionalPattern);
  if (!match) {
    errors.push(`subject must match <type>(<scope>): <subject>; allowed types: ${allowedTypes.join(", ")}`);
    return { ok: false, subject, errors };
  }

  const normalizedSubject = match.groups?.subject || "";
  if (subject.length > 72) {
    errors.push(`subject must be 72 characters or fewer; got ${subject.length}`);
  }

  if (/[.。]$/.test(normalizedSubject)) {
    errors.push("subject must not end with punctuation");
  }

  if (/^\s|\s$/.test(normalizedSubject)) {
    errors.push("subject must not start or end with extra spaces");
  }

  return {
    ok: errors.length === 0,
    subject,
    errors,
    type: match.groups?.type || "",
    scope: match.groups?.scope || "",
    description: normalizedSubject
  };
}

export { allowedTypes, extractSubject, validateCommitMessage };

const allowedTypes = ["feat", "fix", "refactor", "docs", "test", "chore", "ci", "build", "perf", "revert"];
const maxSubjectLength = 120;

const conventionalPattern = new RegExp(`^(?<type>${allowedTypes.join("|")}): (?<subject>.+)$`);

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
    errors.push(`subject must match <type>: <subject>; allowed types: ${allowedTypes.join(", ")}`);
    return { ok: false, subject, errors };
  }

  const normalizedSubject = match.groups?.subject || "";
  if (subject.length > maxSubjectLength) {
    errors.push(`subject must be ${maxSubjectLength} characters or fewer; got ${subject.length}`);
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
    description: normalizedSubject
  };
}

export { allowedTypes, extractSubject, maxSubjectLength, validateCommitMessage };

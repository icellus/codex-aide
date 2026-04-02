import fs from "node:fs";

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function entryPayload(entry) {
  return entry && typeof entry === "object" ? entry.payload || {} : {};
}

function responseAssistantMessageText(entry) {
  if (entry?.type !== "response_item") {
    return "";
  }

  const payload = entryPayload(entry);
  if (payload?.type !== "message" || payload?.role !== "assistant") {
    return "";
  }

  if (!Array.isArray(payload.content)) {
    return "";
  }

  return payload.content
    .map((item) => (item?.type === "output_text" ? String(item.text || "") : ""))
    .filter(Boolean)
    .join("\n");
}

function eventAssistantMessageText(entry) {
  if (entry?.type !== "event_msg") {
    return "";
  }

  const payload = entryPayload(entry);
  if (payload?.type !== "agent_message") {
    return "";
  }

  return String(payload.message || "");
}

function assistantTextCandidates(entry) {
  const payload = entryPayload(entry);
  const phase = normalizeText(payload.phase);
  const candidates = [];

  const eventText = eventAssistantMessageText(entry);
  if (eventText) {
    candidates.push({
      phase,
      text: eventText
    });
  }

  const responseText = responseAssistantMessageText(entry);
  if (responseText) {
    candidates.push({
      phase,
      text: responseText
    });
  }

  return candidates;
}

function extractStructuredResult(text) {
  const matches = Array.from(String(text || "").matchAll(/## Structured Result\s*```json\s*([\s\S]*?)\s*```/g));
  if (matches.length === 0) {
    return null;
  }

  const raw = matches[matches.length - 1][1];
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function latestAssistantMessage(entries, options = {}) {
  const preferPhase = normalizeText(options.preferPhase);
  let fallback = null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidates = assistantTextCandidates(entries[index]);
    for (const candidate of candidates) {
      if (!candidate.text) {
        continue;
      }

      const record = {
        messageText: candidate.text,
        phase: candidate.phase,
        index
      };

      if (!preferPhase || candidate.phase === preferPhase) {
        return record;
      }

      if (!fallback) {
        fallback = record;
      }
    }
  }

  return fallback;
}

function latestStructuredResult(entries, options = {}) {
  const preferPhase = normalizeText(options.preferPhase);
  let fallback = null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidates = assistantTextCandidates(entries[index]);
    for (const candidate of candidates) {
      if (!candidate.text || !candidate.text.includes("## Structured Result")) {
        continue;
      }

      const parsed = extractStructuredResult(candidate.text);
      if (!parsed || typeof parsed !== "object") {
        continue;
      }

      const record = {
        structured: parsed,
        messageText: candidate.text,
        phase: candidate.phase,
        index
      };

      if (!preferPhase || candidate.phase === preferPhase) {
        return record;
      }

      if (!fallback) {
        fallback = record;
      }
    }
  }

  return fallback;
}

function entryTurnId(entry) {
  const payload = entryPayload(entry);
  return normalizeText(payload.turn_id || payload.turnId);
}

function isTaskStartedEntry(entry, turnId = "") {
  const payload = entryPayload(entry);
  if (entry?.type !== "event_msg" || payload?.type !== "task_started") {
    return false;
  }

  return !turnId || entryTurnId(entry) === turnId;
}

function collectTurnEntries(lines, turnId) {
  const normalizedTurnId = normalizeText(turnId);
  if (!normalizedTurnId) {
    return [];
  }

  let startIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (isTaskStartedEntry(lines[index], normalizedTurnId)) {
      startIndex = index;
    }
  }

  if (startIndex < 0) {
    return [];
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (isTaskStartedEntry(lines[index]) && entryTurnId(lines[index]) !== normalizedTurnId) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex);
}

function readTranscriptLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export {
  collectTurnEntries,
  entryTurnId,
  eventAssistantMessageText,
  extractStructuredResult,
  latestAssistantMessage,
  latestStructuredResult,
  readTranscriptLines,
  responseAssistantMessageText
};

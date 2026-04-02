function invalidJsonInputError(error) {
  const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
  return new Error(`Invalid JSON input${detail}`);
}

async function readRawStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonStdinEnvelope(options = {}) {
  const strict = Boolean(options?.strict);
  const raw = await readRawStdin();
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      raw,
      value: {},
      parseError: null
    };
  }

  try {
    return {
      raw,
      value: JSON.parse(trimmed),
      parseError: null
    };
  } catch (error) {
    if (!strict) {
      return {
        raw,
        value: {},
        parseError: null
      };
    }

    return {
      raw,
      value: {},
      parseError: invalidJsonInputError(error)
    };
  }
}

export async function readJsonStdin(options = {}) {
  const envelope = await readJsonStdinEnvelope(options);
  if (envelope.parseError) {
    throw envelope.parseError;
  }
  return envelope.value;
}

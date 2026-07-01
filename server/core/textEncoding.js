const mojibakePatterns = [
  /\u00C3[\u0080-\u00BF]/gu,
  /\u00C2[\u0080-\u00BF]/gu,
  /\u00C6[\u0080-\u00BF]/gu,
  /\u00C4[\u0080-\u00BF]/gu,
  /\u00C5[\u0080-\u00BF]/gu,
  /[\u00E0-\u00EF][\u0080-\u00BF]/gu,
  /\u00E1[\u00BA-\u00BB]/gu,
  /\u00E2[\u0080-\u00BF]/gu,
  /\uFFFD/gu
];

const documentTextKeys = [
  "title",
  "departmentName",
  "originalName",
  "sourcePath",
  "previewError",
  "createdByName",
  "updatedByName"
];

const countMatches = (text, pattern) => {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

export const mojibakeScore = (value = "") => {
  const text = String(value || "");
  return mojibakePatterns.reduce((score, pattern) => score + countMatches(text, pattern), 0);
};

export const repairMojibakeText = (value) => {
  if (typeof value !== "string" || !value) return value;
  const currentScore = mojibakeScore(value);
  if (!currentScore) return value;

  const repaired = Buffer.from(value, "latin1").toString("utf8");
  const repairedScore = mojibakeScore(repaired);
  if (!repaired || repaired.includes("\uFFFD") || repairedScore >= currentScore) {
    return value;
  }
  return repaired;
};

export const normalizeDocumentTextFields = (document = {}) => {
  const normalized = { ...document };
  for (const key of documentTextKeys) {
    if (typeof normalized[key] === "string") {
      normalized[key] = repairMojibakeText(normalized[key]);
    }
  }
  return normalized;
};

export const normalizeDocumentPatch = (updates = {}) => {
  const normalized = { ...updates };
  for (const key of documentTextKeys) {
    if (Object.prototype.hasOwnProperty.call(normalized, key) && typeof normalized[key] === "string") {
      normalized[key] = repairMojibakeText(normalized[key]);
    }
  }
  return normalized;
};

import { generateAIText } from "./aiProviderService.js";
import { safeParse, wrapServiceError } from "./utils.js";

// FINAL MASTER PROMPT (strict JSON-only output). Keep this stable.
const MASTER_PROMPT = `
You are a strict document analysis engine.

Return ONLY valid JSON.

DO NOT:
- add explanation
- add markdown
- add comments
- add extra text

OUTPUT FORMAT:

{
  "summary": "string",
  "keywords": ["string"],
  "key_points": [
    {
      "point": "string",
      "importance": "high | medium | low"
    }
  ],
  "highlights": ["string"],
  "document_type": "string",
  "confidence": number
}

RULES:
- summary ≤ 120 words
- keywords: 5–10 unique
- key_points: 4–8
- no duplicates
- confidence: 0–100 integer

If unclear text → return empty fields.

TEXT:
{{chunk}}
`.trim();

const EMPTY_RESULT = Object.freeze({
  summary: "",
  keywords: [],
  key_points: [],
  highlights: [],
  document_type: "",
  confidence: 0,
});

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : "";

const uniqueStrings = (arr, { max } = {}) => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const s = normalizeString(item);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (typeof max === "number" && out.length >= max) break;
  }
  return out;
};

const normalizeImportance = (value) => {
  const v = normalizeString(value).toLowerCase();
  if (v === "high" || v === "medium" || v === "low") return v;
  return "low";
};

const normalizeKeyPoints = (arr, { max } = {}) => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const point = normalizeString(item?.point);
    if (!point) continue;
    const key = point.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      point,
      importance: normalizeImportance(item?.importance),
    });
    if (typeof max === "number" && out.length >= max) break;
  }
  return out;
};

const clampConfidence = (value) => {
  const asNum = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (Number.isNaN(asNum)) return 0;
  return Math.max(0, Math.min(100, Math.round(asNum)));
};

const normalizeResult = (value) => {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : Array.isArray(value) &&
          value.length === 1 &&
          value[0] &&
          typeof value[0] === "object" &&
          !Array.isArray(value[0])
        ? value[0]
        : null;

  if (!obj) return { ...EMPTY_RESULT };

  return {
    summary: normalizeString(obj.summary),
    keywords: uniqueStrings(obj.keywords, { max: 10 }),
    key_points: normalizeKeyPoints(obj.key_points, { max: 8 }),
    highlights: uniqueStrings(obj.highlights, { max: 20 }),
    document_type: normalizeString(obj.document_type),
    confidence: clampConfidence(obj.confidence),
  };
};

const truncateWords = (text, maxWords) => {
  const str = normalizeString(text);
  if (!str) return "";
  if (!maxWords || maxWords <= 0) return str;
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(" ");
};

const importanceRank = (value) => {
  const v = normalizeImportance(value);
  if (v === "high") return 3;
  if (v === "medium") return 2;
  return 1;
};

const mergeDocumentType = (results) => {
  const counts = new Map();
  for (const r of results) {
    const dt = normalizeString(r?.document_type);
    if (!dt) continue;
    const key = dt.toLowerCase();
    if (!counts.has(key)) {
      counts.set(key, { value: dt, count: 1 });
      continue;
    }
    counts.set(key, { ...counts.get(key), count: (counts.get(key)?.count || 0) + 1 });
  }
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.value || "";
};

export const analyzeChunk = async (chunk) => {
  try {
    const prompt = MASTER_PROMPT.replace("{{chunk}}", String(chunk ?? ""));
    const content = await generateAIText({
      prompt,
      temperature: 0.2,
    });

    if (process.env.AI_LOG_RAW === "true") {
      console.log("📡 Raw AI:", content);
    }

    return normalizeResult(safeParse(content));
  } catch (error) {
    throw wrapServiceError(error, "AI analyzeChunk failed");
  }
};

export const mergeResults = async (results) => {
  try {
    const normalized = Array.isArray(results)
      ? results.map((r) => normalizeResult(r))
      : [];

    const summaryJoined = uniqueStrings(
      normalized.map((r) => r.summary).filter(Boolean),
      { max: 20 }
    ).join(" ");

    const mergedKeywords = uniqueStrings(
      normalized.flatMap((r) => r.keywords || []),
      { max: 10 }
    );

    const mergedHighlights = uniqueStrings(
      normalized.flatMap((r) => r.highlights || []),
      { max: 10 }
    );

    const keyPointMap = new Map();
    const keyPointOrder = [];
    for (const r of normalized) {
      for (const kp of Array.isArray(r.key_points) ? r.key_points : []) {
        const point = normalizeString(kp?.point);
        if (!point) continue;
        const key = point.toLowerCase();
        const nextImportance = normalizeImportance(kp?.importance);

        if (!keyPointMap.has(key)) {
          keyPointMap.set(key, { point, importance: nextImportance });
          keyPointOrder.push(key);
          continue;
        }

        const existing = keyPointMap.get(key);
        if (importanceRank(nextImportance) > importanceRank(existing.importance)) {
          keyPointMap.set(key, { point: existing.point, importance: nextImportance });
        }
      }
    }
    const mergedKeyPoints = keyPointOrder
      .map((k) => keyPointMap.get(k))
      .filter(Boolean)
      .slice(0, 8);

    const confidences = normalized
      .map((r) => clampConfidence(r.confidence))
      .filter((n) => typeof n === "number" && !Number.isNaN(n));
    const confidence =
      confidences.length > 0
        ? clampConfidence(
            Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
          )
        : 0;

    return {
      summary: truncateWords(summaryJoined, 120),
      keywords: mergedKeywords,
      key_points: mergedKeyPoints,
      highlights: mergedHighlights,
      document_type: mergeDocumentType(normalized),
      confidence,
    };
  } catch (error) {
    throw wrapServiceError(error, "mergeResults failed");
  }
};

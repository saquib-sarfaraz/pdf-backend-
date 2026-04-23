import { getOpenAI } from "../config/openai.js";

const SYSTEM_PROMPT = `
You are a document intelligence engine.
Return ONLY valid JSON.

{
  "summary": "string",
  "keywords": ["string"],
  "key_points": [
    { "point": "string", "importance": "high | medium | low" }
  ],
  "highlight_sentences": ["string"],
  "document_type": "string",
  "confidence_score": number
}
`;

const safeJsonParse = (s) => {
  try {
    return JSON.parse(s);
  } catch (e) {
    const maybe = s?.match(/\{[\s\S]*\}$/)?.[0];
    if (maybe) return JSON.parse(maybe);
    throw e;
  }
};

export const analyzeChunk = async (chunk) => {
  const openai = getOpenAI();
  if (!openai) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Analyze this text:\n${chunk}` },
    ],
    response_format: { type: "json_object" },
  });

  return safeJsonParse(response.choices[0].message.content);
};

export const mergeResults = async (results) => {
  const openai = getOpenAI();
  if (!openai) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Merge multiple JSON analyses into one final JSON. Remove duplicates. Return ONLY valid JSON.",
      },
      { role: "user", content: JSON.stringify(results) },
    ],
    response_format: { type: "json_object" },
  });

  return safeJsonParse(response.choices[0].message.content);
};

import { generateGeminiText } from "./geminiService.js";
import { generateGrokText } from "./grokService.js";
import { generateGroqText } from "./groqService.js";

const normalizeProvider = (value) => String(value || "").trim().toLowerCase();

export const getAIProvider = () => {
  const explicit = normalizeProvider(process.env.AI_PROVIDER);
  if (explicit) return explicit === "xai" ? "grok" : explicit;

  // Auto-select based on what is configured.
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.XAI_API_KEY) return "grok";

  // Keep a deterministic default for local dev.
  return "groq";
};

export const getAIEnvSnapshot = () => ({
  ai_provider: getAIProvider(),
  groq_key_present: Boolean(process.env.GROQ_API_KEY),
  gemini_key_present: Boolean(process.env.GEMINI_API_KEY),
  xai_key_present: Boolean(process.env.XAI_API_KEY),
});

const unsupportedProviderError = (provider) => {
  const err = new Error(
    `Unsupported AI_PROVIDER "${provider}". Use "groq", "gemini", or "grok".`
  );
  err.status = 500;
  return err;
};

export const generateAIText = async ({
  prompt,
  temperature,
  model,
  provider = getAIProvider(),
} = {}) => {
  const resolved = normalizeProvider(provider);

  if (resolved === "groq") {
    return generateGroqText({
      prompt,
      temperature,
      model,
    });
  }

  if (resolved === "grok" || resolved === "xai") {
    return generateGrokText({
      prompt,
      temperature,
      model,
    });
  }

  if (resolved === "gemini") {
    return generateGeminiText({
      prompt,
      temperature,
      model,
    });
  }

  throw unsupportedProviderError(provider);
};

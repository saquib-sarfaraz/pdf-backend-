import Groq from "groq-sdk";

const buildError = ({ message, status, details }) => {
  const err = new Error(message);
  if (typeof status === "number") err.status = status;
  if (details !== undefined) err.details = details;
  return err;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getStatusFromError = (err) =>
  err?.status || err?.statusCode || err?.response?.status;

const shouldRetryStatus = (status) =>
  status === 408 || status === 429 || (status >= 500 && status <= 599);

let cachedClient = null;
let cachedApiKey = null;

const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw buildError({
      message: "Missing GROQ_API_KEY",
      status: 500,
    });
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new Groq({ apiKey });
    cachedApiKey = apiKey;
  }

  return cachedClient;
};

export const generateGroqText = async (input, options = {}) => {
  const resolved =
    typeof input === "string"
      ? { prompt: input, ...options }
      : { ...(input || {}) };

  const prompt = String(resolved.prompt ?? "");
  const model =
    resolved.model || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const temperature =
    typeof resolved.temperature === "number" ? resolved.temperature : 0.2;

  const maxRetries =
    Number(process.env.GROQ_MAX_RETRIES || process.env.AI_MAX_RETRIES) || 2;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const groq = getGroqClient();
      const res = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: "Return ONLY valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature,
      });

      const content = res?.choices?.[0]?.message?.content || "";
      if (!content || !content.trim()) {
        const err = buildError({
          message: "Groq returned an empty response",
          status: 502,
          details: res,
        });
        err.isEmptyResponse = true;
        throw err;
      }

      return content;
    } catch (err) {
      if (err?.isEmptyResponse) {
        console.warn("⚠️ Groq empty response, retrying...");
      } else {
        console.error("❌ Groq Error:", err?.message || err);
      }
      lastError = err;

      const status = getStatusFromError(err);
      if (attempt < maxRetries && shouldRetryStatus(status)) {
        const baseDelay = 500 * 2 ** attempt;
        const delay = Math.min(5000, baseDelay) + Math.floor(Math.random() * 200);
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }

  throw (
    lastError ||
    buildError({
      message: "Groq request failed",
      status: 502,
    })
  );
};

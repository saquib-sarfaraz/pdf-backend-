const getGeminiApiBases = () => {
  const version = process.env.GEMINI_API_VERSION;
  if (version) {
    return [`https://generativelanguage.googleapis.com/${version}`];
  }

  // Default to v1beta but transparently fall back to v1 if needed.
  return [
    "https://generativelanguage.googleapis.com/v1beta",
    "https://generativelanguage.googleapis.com/v1",
  ];
};

const buildEndpoint = ({ apiBase, model, apiKey }) =>
  `${apiBase}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

const getModelCandidates = (model) => {
  const primary = String(model || "").trim();
  const candidates = new Set();

  if (primary) candidates.add(primary);

  if (primary && !primary.endsWith("-latest")) {
    candidates.add(`${primary}-latest`);
  }

  if (primary.endsWith("-latest")) {
    candidates.add(primary.replace(/-latest$/, ""));
  }

  return [...candidates].filter(Boolean);
};

const extractCandidateText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("");
};

const buildError = ({ message, status, data }) => {
  const err = new Error(message);
  if (typeof status === "number") err.status = status;
  if (data !== undefined) err.details = data;
  return err;
};

export const generateGeminiText = async ({
  prompt,
  model = process.env.GEMINI_MODEL || "gemini-1.5-flash",
  temperature = 0.3,
} = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw buildError({
      message: "Missing GEMINI_API_KEY",
      status: 500,
    });
  }

  const payload = {
    contents: [
      {
        parts: [{ text: String(prompt ?? "") }],
      },
    ],
    generationConfig: { temperature },
  };

  const apiBases = getGeminiApiBases();
  const modelCandidates = getModelCandidates(model);
  let lastError;

  for (let i = 0; i < apiBases.length; i++) {
    for (let j = 0; j < modelCandidates.length; j++) {
      const candidateModel = modelCandidates[j];
      const endpoint = buildEndpoint({
        apiBase: apiBases[i],
        model: candidateModel,
        apiKey,
      });

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const apiMessage =
            data?.error?.message ||
            data?.message ||
            `Gemini request failed with status ${res.status}`;
          const status = data?.error?.code || res.status;
          const err = buildError({
            message: apiMessage,
            status,
            data,
          });

          lastError = err;

          // If the model name is wrong, a 404 may be returned; try the next model alias.
          if (res.status === 404 || status === 404) {
            continue;
          }

          throw err;
        }

        const text = extractCandidateText(data);
        if (!text) {
          throw buildError({
            message: "Gemini returned an empty response",
            status: 502,
            data,
          });
        }

        return text;
      } catch (error) {
        lastError = error;

        // Keep trying only when it's a "not found" error.
        if (error?.status === 404 || error?.statusCode === 404) {
          continue;
        }

        // For non-404 failures, if the API version isn't pinned, try the next base URL.
        if (!process.env.GEMINI_API_VERSION && i < apiBases.length - 1) {
          break;
        }

        throw error;
      }
    }
  }

  throw lastError || buildError({ message: "Gemini request failed", status: 502 });
};

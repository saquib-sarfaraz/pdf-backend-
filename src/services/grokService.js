const buildError = ({ message, status, data, retryAfterMs }) => {
  const err = new Error(message);
  if (typeof status === "number") err.status = status;
  if (data !== undefined) err.details = data;
  if (typeof retryAfterMs === "number") err.retryAfterMs = retryAfterMs;
  return err;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfterMs = (value) => {
  const v = String(value || "").trim();
  if (!v) return null;

  // Retry-After can be seconds or a HTTP date.
  if (/^\d+$/.test(v)) return Number(v) * 1000;

  const asDate = Date.parse(v);
  if (Number.isNaN(asDate)) return null;
  const delta = asDate - Date.now();
  return delta > 0 ? delta : null;
};

const shouldRetryStatus = (status) =>
  status === 408 || status === 429 || (status >= 500 && status <= 599);

const extractTextFromResponse = (data) => {
  if (typeof data?.output_text === "string") return data.output_text;

  // "Responses" style (OpenAI-compatible)
  if (Array.isArray(data?.output)) {
    const parts = [];
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (typeof part?.text === "string") parts.push(part.text);
          else if (typeof part === "string") parts.push(part);
        }
      }
      if (typeof item?.text === "string") parts.push(item.text);
    }
    const joined = parts.filter(Boolean).join("");
    if (joined) return joined;
  }

  // "Chat Completions" style fallback
  const choice = data?.choices?.[0];
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (Array.isArray(choice?.message?.content)) {
    const joined = choice.message.content
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("");
    if (joined) return joined;
  }
  if (typeof choice?.text === "string") return choice.text;

  return "";
};

export const generateGrokText = async (input, options = {}) => {
  const resolved =
    typeof input === "string" ? { prompt: input, ...options } : { ...(input || {}) };

  const prompt = String(resolved.prompt ?? "");
  const model = resolved.model || process.env.XAI_MODEL || "grok-4.20-reasoning";
  const temperature =
    typeof resolved.temperature === "number" ? resolved.temperature : 0.2;

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw buildError({
      message: "Missing XAI_API_KEY",
      status: 500,
    });
  }

  const apiBase = String(process.env.XAI_API_BASE || "https://api.x.ai/v1").replace(
    /\/+$/,
    ""
  );
  const allowChatFallback = process.env.XAI_DISABLE_CHAT_FALLBACK !== "true";
  const endpoints = [
    {
      kind: "responses",
      url: `${apiBase}/responses`,
      payload: { model, input: prompt, temperature },
    },
    ...(allowChatFallback
      ? [
          {
            kind: "chat",
            url: `${apiBase}/chat/completions`,
            payload: {
              model,
              messages: [{ role: "user", content: prompt }],
              temperature,
            },
          },
        ]
      : []),
  ];

  const timeoutMs =
    Number(process.env.XAI_TIMEOUT_MS || process.env.AI_TIMEOUT_MS) || 60000;
  const maxRetries =
    Number(process.env.XAI_MAX_RETRIES || process.env.AI_MAX_RETRIES) || 2;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let res;
      let data;
      let retryAfterMs;

      for (let i = 0; i < endpoints.length; i++) {
        const candidate = endpoints[i];

        res = await fetch(candidate.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(candidate.payload),
          signal: controller.signal,
        });

        retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        data = await res.json().catch(() => ({}));

        if (res.ok) {
          const text = extractTextFromResponse(data);
          if (!text) {
            throw buildError({
              message: "Grok returned an empty response",
              status: 502,
              data,
            });
          }
          return text;
        }

        // If the Responses endpoint is unavailable, transparently fall back to Chat Completions.
        if (
          candidate.kind === "responses" &&
          allowChatFallback &&
          (res.status === 404 || res.status === 405)
        ) {
          lastError = buildError({
            message: "xAI /responses endpoint unavailable; falling back to /chat/completions",
            status: res.status,
            data,
          });
          continue;
        }

        break;
      }

      const message =
        data?.error?.message ||
        data?.message ||
        `Grok request failed with status ${res?.status || 500}`;
      const err = buildError({
        message,
        status: res?.status,
        data,
        retryAfterMs: retryAfterMs ?? undefined,
      });
      lastError = err;

      if (attempt < maxRetries && shouldRetryStatus(res?.status)) {
        const baseDelay = retryAfterMs ?? 500 * 2 ** attempt;
        const delay = Math.min(5000, baseDelay) + Math.floor(Math.random() * 200);
        await sleep(delay);
        continue;
      }

      throw err;
    } catch (error) {
      lastError = error;

      const status = error?.status || error?.statusCode;
      const isAbort = error?.name === "AbortError";
      const retryAfterMs = error?.retryAfterMs;

      if (attempt < maxRetries && (isAbort || shouldRetryStatus(status))) {
        const baseDelay = typeof retryAfterMs === "number" ? retryAfterMs : 500 * 2 ** attempt;
        const delay = Math.min(5000, baseDelay) + Math.floor(Math.random() * 200);
        await sleep(delay);
        continue;
      }

      if (isAbort) {
        throw buildError({
          message: `Grok request timed out after ${timeoutMs}ms`,
          status: 504,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ||
    buildError({
      message: "Grok request failed",
      status: 502,
    })
  );
};

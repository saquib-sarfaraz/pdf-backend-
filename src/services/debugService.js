import mongoose from "mongoose";
import { generateAIText, getAIEnvSnapshot, getAIProvider } from "./aiProviderService.js";
import { safeParse } from "./utils.js";

const DEBUG_SYSTEM_PROMPT = `
You are a backend debugging and recovery engine.

Your job is to analyze a failing document processing pipeline and identify exactly where and why it failed.

Be strict, precise, and technical.

DO NOT guess. Only use provided data.

Return ONLY JSON.
`.trim();

const safeJsonParse = (s) =>
  safeParse(s, { errorMessage: "Auto-debug returned invalid JSON" });

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeLogs = (logs) => {
  if (!logs) return "";
  if (Array.isArray(logs)) return logs.map((l) => String(l)).join("\n");
  return String(logs);
};

const truncate = (s, maxChars) => {
  const str = String(s ?? "");
  if (!maxChars || str.length <= maxChars) return str;
  return str.slice(0, maxChars) + `\n... (truncated, ${str.length} chars total)`;
};

const buildDebugUserPrompt = ({ logs, requestStatus, responseBody, env }) => {
  const inputData = {
    logs,
    request_status: requestStatus,
    response_body: responseBody,
    env,
  };

  return `
Analyze the following backend pipeline execution.

Pipeline steps:
1. File Upload
2. PDF Text Extraction
3. Text Chunking
4. AI Processing
5. Result Merging
6. Response Return

INPUT DATA:

${JSON.stringify(inputData, null, 2)}

TASK:

1. Identify the failed step
2. Explain exact reason
3. Suggest precise fix
4. Give confidence score

RETURN FORMAT:

{
  "failed_step": "string",
  "reason": "exact technical issue",
  "fix": "step-by-step solution",
  "confidence": number (0-100)
}
`.trim();
};

const localDebugFallback = ({ logs, statusCode, responseBody, env }) => {
  const provider = env?.ai_provider || getAIProvider();
  const providerLabel =
    provider === "groq"
      ? "Groq"
      : provider === "grok" || provider === "xai"
        ? "Grok (xAI)"
        : "Gemini";

  const bodyText = (() => {
    if (typeof responseBody === "string") return responseBody;
    if (responseBody && typeof responseBody === "object") {
      return responseBody.error || responseBody.message || safeStringify(responseBody);
    }
    return String(responseBody ?? "");
  })();

  const logsText = normalizeLogs(logs);

  const keyPresent =
    provider === "groq"
      ? env?.groq_key_present
      : provider === "grok" || provider === "xai"
        ? env?.xai_key_present
        : env?.gemini_key_present;
  const missingKeyToken =
    provider === "groq"
      ? "GROQ_API_KEY"
      : provider === "grok" || provider === "xai"
        ? "XAI_API_KEY"
        : "GEMINI_API_KEY";

  if (!keyPresent || bodyText.includes(`Missing ${missingKeyToken}`)) {
    return {
      failed_step: "AI Processing",
      reason: `${missingKeyToken} is missing (backend cannot call ${providerLabel}).`,
      fix: `Set ${missingKeyToken} in \`.env\` and restart the server.`,
      confidence: 98,
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      failed_step: "AI Processing",
      reason: `${providerLabel} returned Unauthorized/Forbidden (API key invalid or access not enabled).`,
      fix: `Rotate/replace ${missingKeyToken}, ensure the provider access is enabled, then restart the server.`,
      confidence: 98,
    };
  }

  if (statusCode === 429) {
    return {
      failed_step: "AI Processing",
      reason: `${providerLabel} returned 429 Rate Limit / Quota exceeded.`,
      fix: "Check your provider quota/billing and keep retry/backoff enabled.",
      confidence: 90,
    };
  }

  if (
    providerLabel === "Gemini" &&
    statusCode === 404 &&
    bodyText.toLowerCase().includes("models/") &&
    bodyText.toLowerCase().includes("not found")
  ) {
    return {
      failed_step: "AI Processing",
      reason: "Gemini model name is not valid for the configured API version.",
      fix: "Set `GEMINI_API_VERSION=v1beta` and `GEMINI_MODEL=gemini-1.5-flash` (avoid `-latest`), then restart the server.",
      confidence: 92,
    };
  }

  if (providerLabel === "Groq" && statusCode === 404) {
    return {
      failed_step: "AI Processing",
      reason: "Groq returned 404 Not Found (check model name and API access).",
      fix: "Verify `GROQ_MODEL` is valid for your Groq account, then retry.",
      confidence: 80,
    };
  }

  if (providerLabel === "Grok (xAI)" && statusCode === 404) {
    return {
      failed_step: "AI Processing",
      reason: "Grok returned 404 Not Found (check model name and API base URL).",
      fix: "Verify `XAI_API_BASE=https://api.x.ai/v1` and a valid `XAI_MODEL`, then retry.",
      confidence: 85,
    };
  }

  if (bodyText.includes("Missing PDF file")) {
    return {
      failed_step: "File Upload",
      reason:
        "No file received by the backend (req.file missing). Field name must match `upload.single(\"pdf\")`.",
      fix: "Send multipart/form-data with field name `pdf` (e.g. `formData.append(\"pdf\", file)`).",
      confidence: 95,
    };
  }

  if (bodyText.includes("Could not extract any text")) {
    return {
      failed_step: "PDF Text Extraction",
      reason: "PDF text extraction returned empty text.",
      fix: "Try a text-based PDF; for scanned PDFs add OCR before sending to analysis.",
      confidence: 85,
    };
  }

  if (bodyText.toLowerCase().includes("mongo") || bodyText.toLowerCase().includes("mongoose")) {
    return {
      failed_step: "Response Return",
      reason: "MongoDB/Mongoose error while saving the analysis result.",
      fix: "Verify `MONGO_URI` connectivity/credentials and ensure MongoDB is reachable.",
      confidence: 80,
    };
  }

  if (logsText.includes("🤖 Running AI analysis")) {
    return {
      failed_step: "AI Processing",
      reason: `Failure occurred during ${providerLabel} processing (see backend logs for the exact error).`,
      fix: `Confirm ${missingKeyToken} + model access, then retry with backend logs enabled.`,
      confidence: 70,
    };
  }

  return {
    failed_step: "Unknown",
    reason: bodyText || "Unknown error",
    fix: "Check backend logs for the first thrown error and stack trace.",
    confidence: 50,
  };
};

export const getPipelineDebug = async ({
  logs = [],
  statusCode = 500,
  responseBody = {},
  env,
} = {}) => {
  if (process.env.AUTO_DEBUG !== "true") return null;

  const resolvedEnv = {
    ...getAIEnvSnapshot(),
    mongo_connected: mongoose.connection?.readyState === 1,
    ...(env || {}),
  };

  const provider = resolvedEnv.ai_provider || getAIProvider();
  const keyPresent =
    provider === "groq"
      ? resolvedEnv.groq_key_present
      : provider === "grok" || provider === "xai"
        ? resolvedEnv.xai_key_present
        : resolvedEnv.gemini_key_present;

  // If the failure is clearly auth/rate limit related, skip the extra
  // debug call (it will fail too) and return a deterministic local diagnosis.
  if (
    !keyPresent ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 429
  ) {
    return localDebugFallback({
      logs,
      statusCode,
      responseBody,
      env: resolvedEnv,
    });
  }

  const maxChars = Number(process.env.AUTO_DEBUG_MAX_LOG_CHARS) || 8000;
  const logsText = truncate(normalizeLogs(logs), maxChars);

  const userPrompt = buildDebugUserPrompt({
    logs: logsText,
    requestStatus: statusCode,
    responseBody: safeStringify(responseBody),
    env: resolvedEnv,
  });

  try {
    const debugModel =
      provider === "groq"
        ? process.env.GROQ_DEBUG_MODEL ||
          process.env.GROQ_MODEL ||
          "llama-3.3-70b-versatile"
        : provider === "grok" || provider === "xai"
          ? process.env.XAI_DEBUG_MODEL || process.env.XAI_MODEL
          : process.env.GEMINI_DEBUG_MODEL ||
            process.env.GEMINI_MODEL ||
            "gemini-1.5-flash";

    const content = await generateAIText({
      provider,
      model: debugModel,
      temperature: 0,
      prompt: `${DEBUG_SYSTEM_PROMPT}\n\n${userPrompt}`,
    });
    if (!content) {
      return localDebugFallback({
        logs,
        statusCode,
        responseBody,
        env: resolvedEnv,
      });
    }

    return safeJsonParse(content);
  } catch (error) {
    return localDebugFallback({
      logs,
      statusCode,
      responseBody: {
        error: `Auto-debug request failed: ${error?.message || "Unknown error"}`,
      },
      env: resolvedEnv,
    });
  }
};

export const safeParse = (text, { errorMessage = "Invalid JSON from AI" } = {}) => {
  try {
    return JSON.parse(text);
  } catch (cause) {
    const match = String(text ?? "").match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerCause) {
        const err = new Error(errorMessage);
        err.status = 502;
        err.cause = innerCause;
        throw err;
      }
    }

    const arrayMatch = String(text ?? "").match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (innerCause) {
        const err = new Error(errorMessage);
        err.status = 502;
        err.cause = innerCause;
        throw err;
      }
    }

    const err = new Error(errorMessage);
    err.status = 502;
    err.cause = cause;
    throw err;
  }
};

export const wrapServiceError = (error, context) => {
  const status = error?.status || error?.statusCode;
  const err = new Error(`${context}: ${error?.message || "Request failed"}`);
  if (typeof status === "number") err.status = status;
  err.name = error?.name || "ServiceError";
  err.cause = error;
  return err;
};

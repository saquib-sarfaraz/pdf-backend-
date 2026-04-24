export const errorHandler = (err, req, res, next) => {
  const status = Number(err?.status || err?.statusCode) || 500;

  console.error("ERROR:", err);

  const message = err?.message || "Internal Server Error";

  const payload = {
    success: false,
    message,
    error: message,
  };

  if (process.env.NODE_ENV !== "production") {
    payload.name = err?.name;
    payload.status = status;
    if (err?.debug) payload.debug = err.debug;
  }

  res.status(status).json(payload);
};

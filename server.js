import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    const providerRaw =
      process.env.AI_PROVIDER ||
      (process.env.GROQ_API_KEY
        ? "groq"
        : process.env.GEMINI_API_KEY
          ? "gemini"
          : process.env.XAI_API_KEY
            ? "grok"
            : "groq");
    const provider = String(providerRaw || "")
      .trim()
      .toLowerCase()
      .replace(/^xai$/, "grok");
    const model =
      provider === "groq"
        ? process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
        : provider === "grok" || provider === "xai"
          ? process.env.XAI_MODEL || "grok-4.20-reasoning"
          : process.env.GEMINI_MODEL || "gemini-1.5-flash";

    console.log("Starting server...");
    console.log(
      `AI: provider=${provider} | model=${model} | autoDebug=${process.env.AUTO_DEBUG || "false"}`
    );
    if (provider === "gemini") {
      console.log(`Gemini: apiVersion=${process.env.GEMINI_API_VERSION || "auto"}`);
    }

    await connectDB();

    const server = app.listen(PORT, () => {
      console.log("=================================");
      console.log("Server running successfully");
      console.log(`URL: http://localhost:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`Started at: ${new Date().toLocaleString()}`);
      console.log("=================================");
    });

    server.on("error", (err) => {
      if (err?.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use.`);
      } else {
        console.error("Server error:", err?.message || err);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error?.message || error);
    process.exit(1);
  }
};

startServer();

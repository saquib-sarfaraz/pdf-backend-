import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    console.log("Starting server...");

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

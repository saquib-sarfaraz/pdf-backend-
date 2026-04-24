import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import analysisRoutes from "./routes/analysisRoutes.js";
import { requestLogger } from "./middleware/logger.js";
import { errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();

// Allow requests from any frontend during development.
// In production, restrict `origin` to your deployed frontend domain(s).
const corsOptions = {
  origin: (origin, cb) => cb(null, true),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/analysis", analysisRoutes);
app.use((req, res) =>
  res
    .status(404)
    .json({ success: false, message: "Route not found", error: "Route not found" })
);
app.use(errorHandler);

export default app;

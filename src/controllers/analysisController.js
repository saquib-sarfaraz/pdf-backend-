import fs from "fs";
import Analysis from "../models/Analysis.js";
import { extractTextFromPDF } from "../services/pdfService.js";
import { splitText } from "../services/chunkService.js";
import { analyzeChunk, mergeResults } from "../services/aiService.js";
import { getPipelineDebug } from "../services/debugService.js";

const httpError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const uploadAndAnalyze = async (req, res, next) => {
  const stepLogs = [];
  const logStep = (message, data) => {
    if (data === undefined) {
      stepLogs.push(String(message));
      console.log(message);
      return;
    }

    stepLogs.push(
      `${String(message)} ${(() => {
        try {
          return JSON.stringify(data);
        } catch {
          return String(data);
        }
      })()}`
    );
    console.log(message, data);
  };

  let filePath;
  try {
    logStep("🚀 [START] PDF Analysis Request");
    logStep("📂 req.file:", req.file);

    if (!req.file?.path) {
      throw httpError(400, "Missing PDF file (field: pdf)");
    }

    filePath = req.file.path;
    logStep("📄 File uploaded:", req.file.originalname);

    logStep("📄 Extracting text...");
    const text = await extractTextFromPDF(filePath);
    if (!text.trim()) {
      throw httpError(400, "Could not extract any text");
    }

    const defaultChunkSize = Number.parseInt(process.env.AI_CHUNK_SIZE, 10) || 4000;
    const minChunkSize = Number.parseInt(process.env.AI_MIN_CHUNK_SIZE, 10) || 1000;
    const maxChunkSize = Number.parseInt(process.env.AI_MAX_CHUNK_SIZE, 10) || 8000;
    const maxChunks = Number.parseInt(process.env.AI_MAX_CHUNKS, 10) || 8;

    let chunkSize = Math.max(minChunkSize, Math.min(maxChunkSize, defaultChunkSize));
    let chunks = splitText(text, chunkSize);

    if (chunks.length > maxChunks) {
      const resized = Math.ceil(text.length / maxChunks);
      chunkSize = Math.max(minChunkSize, Math.min(maxChunkSize, resized));
      chunks = splitText(text, chunkSize);
    }

    if (chunks.length > maxChunks) {
      logStep(
        `⚠️ Chunk count (${chunks.length}) still exceeds AI_MAX_CHUNKS=${maxChunks} (AI_MAX_CHUNK_SIZE=${maxChunkSize}).`
      );
    }

    logStep(`✂️ Total chunks: ${chunks.length} (chunkSize=${chunkSize} chars)`);

    logStep("🤖 Running AI analysis...");
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      if (chunks.length > 1) {
        logStep(`🤖 Analyzing chunk ${i + 1}/${chunks.length}...`);
      }
      const analysis = await analyzeChunk(chunks[i]);
      results.push(analysis);
    }

    const finalResult = await mergeResults(results);

    const saved = await Analysis.create({
      filename: req.file.originalname,
      summary: finalResult.summary,
      keywords: finalResult.keywords,
      key_points: finalResult.key_points,
      highlights: finalResult.highlights || finalResult.highlight_sentences,
      document_type: finalResult.document_type,
      confidence_score: finalResult.confidence ?? finalResult.confidence_score,
    });

    return res.json(saved);
  } catch (error) {
    try {
      const statusCode = Number(error?.status || error?.statusCode) || 500;
      const debug = await getPipelineDebug({
        logs: stepLogs,
        statusCode,
        responseBody: { error: error?.message || "Unknown error" },
      });
      if (debug) {
        error.debug = debug;
        console.log("🧠 DEBUG RESULT:", debug);
      }
    } catch (debugError) {
      console.warn("Auto-debug failed:", debugError?.message || debugError);
    }

    return next(error);
  } finally {
    try {
      if (filePath) fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
};

export const getAllAnalyses = async (req, res, next) => {
  try {
    const data = await Analysis.find().sort({ createdAt: -1 });
    return res.json(data);
  } catch (error) {
    return next(error);
  }
};

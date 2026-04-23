import fs from "fs";
import Analysis from "../models/Analysis.js";
import { extractTextFromPDF } from "../services/pdfService.js";
import { splitText } from "../services/chunkService.js";
import { analyzeChunk, mergeResults } from "../services/aiService.js";

export const uploadAndAnalyze = async (req, res) => {
  let filePath;
  try {
    if (!req.file?.path) {
      return res.status(400).json({ error: "Missing PDF file (field: pdf)" });
    }

    filePath = req.file.path;
    console.log("File uploaded:", req.file.originalname);

    console.log("Extracting text...");
    const text = await extractTextFromPDF(filePath);
    if (!text.trim()) {
      return res.status(400).json({ error: "Could not extract any text" });
    }

    const chunks = splitText(text);
    console.log(`Total chunks: ${chunks.length}`);

    console.log("Running AI analysis...");
    const results = [];
    for (const chunk of chunks) {
      const analysis = await analyzeChunk(chunk);
      results.push(analysis);
    }

    const finalResult = await mergeResults(results);

    const saved = await Analysis.create({
      filename: req.file.originalname,
      summary: finalResult.summary,
      keywords: finalResult.keywords,
      key_points: finalResult.key_points,
      highlights: finalResult.highlight_sentences,
      document_type: finalResult.document_type,
      confidence_score: finalResult.confidence_score,
    });

    return res.json(saved);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Analysis failed" });
  } finally {
    try {
      if (filePath) fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
};

export const getAllAnalyses = async (req, res) => {
  const data = await Analysis.find().sort({ createdAt: -1 });
  res.json(data);
};

import express from "express";
import { upload } from "../middleware/upload.js";
import {
  uploadAndAnalyze,
  getAllAnalyses,
} from "../controllers/analysisController.js";

const router = express.Router();

router.post("/upload", upload.single("pdf"), uploadAndAnalyze);
router.get("/", getAllAnalyses);

export default router;

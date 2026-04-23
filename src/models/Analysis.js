import mongoose from "mongoose";

const analysisSchema = new mongoose.Schema({
  filename: String,
  summary: String,
  keywords: [String],
  key_points: [
    {
      point: String,
      importance: String,
    },
  ],
  highlights: [String],
  document_type: String,
  confidence_score: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Analysis", analysisSchema);

import dotenv from "dotenv";
import { generateGroqText } from "../services/groqService.js";

dotenv.config();

const prompt = process.argv.slice(2).join(" ") || 'Return {"status":"ok"}';

const text = await generateGroqText(prompt);
console.log(text);


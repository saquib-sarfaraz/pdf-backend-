import dotenv from "dotenv";
import { generateGrokText } from "../services/grokService.js";

dotenv.config();

const prompt = process.argv.slice(2).join(" ") || 'Return {"status":"ok"}';

const text = await generateGrokText(prompt);
console.log(text);


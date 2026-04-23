import OpenAI from "openai";

let client;

export const getOpenAI = () => {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  client = new OpenAI({ apiKey });
  return client;
};

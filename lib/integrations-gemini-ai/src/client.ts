import { GoogleGenAI } from "@google/genai";

const userKey = process.env.GOOGLE_API_KEY;
const proxyKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const proxyBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

const apiKey = userKey || proxyKey;
if (!apiKey) {
  throw new Error(
    "GOOGLE_API_KEY (preferred) or AI_INTEGRATIONS_GEMINI_API_KEY must be set.",
  );
}

export const ai = new GoogleGenAI({
  apiKey,
  ...(userKey
    ? {}
    : {
        httpOptions: {
          apiVersion: "",
          baseUrl: proxyBaseUrl,
        },
      }),
});

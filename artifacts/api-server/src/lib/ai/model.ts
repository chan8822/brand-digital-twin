import { createGoogleGenerativeAI } from "@ai-sdk/google";

const apiKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];
const baseURL = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];

if (!apiKey || !baseURL) {
  throw new Error(
    "AI_INTEGRATIONS_GEMINI_API_KEY and AI_INTEGRATIONS_GEMINI_BASE_URL must be set",
  );
}

const provider = createGoogleGenerativeAI({ apiKey, baseURL });

export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export function getModel(modelId: string = DEFAULT_MODEL_ID) {
  return provider(modelId);
}

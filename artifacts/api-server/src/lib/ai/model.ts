import { createGoogleGenerativeAI } from "@ai-sdk/google";

const apiKey = process.env["GOOGLE_API_KEY"];
if (!apiKey) {
  throw new Error("GOOGLE_API_KEY must be set");
}

const provider = createGoogleGenerativeAI({ apiKey });

export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export function getModel(modelId: string = DEFAULT_MODEL_ID) {
  return provider(modelId);
}

import { createGoogleGenerativeAI } from "@ai-sdk/google";

const userKey = process.env["GEMINI_API_KEY"];
const proxyKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];
const proxyBaseURL = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];

const apiKey = userKey || proxyKey;
if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY (preferred) or AI_INTEGRATIONS_GEMINI_API_KEY must be set",
  );
}

const provider = userKey
  ? createGoogleGenerativeAI({ apiKey })
  : createGoogleGenerativeAI({ apiKey, baseURL: proxyBaseURL });

export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export function getModel(modelId: string = DEFAULT_MODEL_ID) {
  return provider(modelId);
}

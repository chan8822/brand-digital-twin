import { GoogleGenAI, Modality } from "@google/genai";

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

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

// Edit / transform an existing image with a text instruction.
// The model returns an edited image (e.g. background removed, lighting fixed,
// composition tweaked). Used for background-removal and AI re-touching.
export async function editImage(input: {
  prompt: string;
  imageBase64: string;
  mimeType: string;
}): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: input.imageBase64,
              mimeType: input.mimeType,
            },
          },
          { text: input.prompt },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) =>
      part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

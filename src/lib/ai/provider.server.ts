import { GoogleGenAI, type Part } from "@google/genai";

/**
 * Pluggable LLM provider for CivicAI.
 *
 * Every AI module calls `runAiJson` — swapping Gemini for another LLM only
 * requires changing `AI_MODELS` / the request builder in this one file.
 */

export const AI_MODELS = {
  /** Multimodal reasoning (image + text) — Gemini. */
  vision: "gemini-3.6-flash",
  /** Text-only reasoning / analytics. */
  text: "gemini-3.6-flash",
} as const;

export class AiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

export type AiRequest = {
  system: string;
  user: string;
  /** https URLs or data: URLs. Non-image inputs are ignored. */
  images?: (string | null | undefined)[];
  model?: string;
  temperature?: number;
  retries?: number;
};

function friendly(status: number, body: string) {
  if (status === 429) return "The AI service is busy right now. Please retry in a moment.";
  if (status === 402) return "AI credits are exhausted for this workspace.";
  if (status === 400) return "The AI request could not be processed. Please check the submitted content and try again.";
  return `AI request failed (${status}): ${body.slice(0, 300)}`;
}

function extractJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new AiError("The AI response could not be parsed. Please retry.");
  }
}

function buildGeminiClient() {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new AiError("The Gemini API key is not configured for this project.", 500);
  }

  return new GoogleGenAI({ apiKey });
}

async function fetchImagePart(source: string): Promise<Part> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new AiError("An empty image URL was supplied to the AI service.", 400);
  }

  if (trimmed.startsWith("data:")) {
    const match = /^data:(image\/\w+);base64,/.exec(trimmed);
    if (!match) {
      throw new AiError("The supplied image data URL is not supported.", 400);
    }
    const mimeType = match[1] ?? "";
    if (!/[\/](jpeg|png|webp)$/i.test(mimeType)) {
      throw new AiError("Only JPEG, PNG, and WebP images are supported.", 400);
    }
    return {
      inlineData: {
        mimeType,
        data: trimmed.split(",")[1] ?? "",
      },
    } as Part;
  }

  if (!/^https:\/\//i.test(trimmed)) {
    throw new AiError("Only HTTPS image URLs are supported for AI analysis.", 400);
  }

  try {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new AiError("The provided image could not be downloaded.", 400);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/image\/(jpeg|png|webp)/i.test(contentType)) {
      throw new AiError("Only JPEG, PNG, and WebP images are supported.", 400);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = contentType.split(";")[0]?.trim() || "image/jpeg";
    return {
      inlineData: {
        mimeType,
        data: buffer.toString("base64"),
      },
    } as Part;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("The provided image could not be downloaded.", 400);
  }
}

async function buildGeminiParts(request: AiRequest): Promise<Part[]> {
  const parts: Part[] = [{ text: request.user }];
  const images = (request.images ?? []).filter(
    (url): url is string => typeof url === "string" && url.length > 0,
  );

  for (const image of images.slice(0, 4)) {
    parts.push(await fetchImagePart(image));
  }

  return parts;
}

/** Calls the LLM and returns parsed JSON. Retries transient failures. */
export async function runAiJson<T>(request: AiRequest): Promise<T> {
  const attempts = Math.max(1, request.retries ?? 2);
  let lastError: AiError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const ai = buildGeminiClient();
      const parts = await buildGeminiParts(request);
      const model = request.model ?? (request.images?.some(Boolean) ? AI_MODELS.vision : AI_MODELS.text);

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: request.system,
          temperature: request.temperature ?? 0.2,
          responseMimeType: "application/json",
        },
      });

      const raw = typeof response.text === "string" ? response.text : "";
      if (!raw.trim()) {
        throw new AiError("The AI returned an empty response.", 502);
      }

      return extractJson(raw) as T;
    } catch (error) {
      const aiError =
        error instanceof AiError
          ? error
          : new AiError(error instanceof Error ? error.message : "AI request failed", 500);
      lastError = aiError;
      if (!aiError.retryable || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }

  throw lastError ?? new AiError("AI request failed");
}

export function clampConfidence(value: unknown, fallback = 0.6) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const scaled = num > 1 ? num / 100 : num;
  return Math.min(1, Math.max(0, scaled));
}

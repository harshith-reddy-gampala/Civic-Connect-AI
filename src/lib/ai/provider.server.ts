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
  /** Groq fallback models. Override these after provider validation. */
  groqVision: process.env["GROQ_VISION_MODEL"] ?? "qwen/qwen3.8-27b",
  groqText: process.env["GROQ_TEXT_MODEL"] ?? "qwen/qwen3.8-27b",
} as const;

export class AiError extends Error {
  status: number;
  retryable: boolean;
  provider?: AiProvider | undefined;
  diagnosticCategory?: string | undefined;

  constructor(message: string, status = 500, retryable = status === 429 || status >= 500, provider?: AiProvider) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.retryable = retryable;
    this.provider = provider;
  }
}

export type AiProvider = "gemini" | "groq";

export type AiRequest = {
  system: string;
  user: string;
  /** https URLs or data: URLs. Non-image inputs are ignored. */
  images?: (string | null | undefined)[];
  model?: string;
  temperature?: number;
  retries?: number;
  /** Optional authorization-bound scope for in-flight request deduplication. */
  dedupeScope?: string;
};

function friendly(status: number, body: string) {
  if (status === 429) return "The AI service is busy right now. Please retry in a moment.";
  if (status === 402) return "AI credits are exhausted for this workspace.";
  if (status === 400) return "The AI request could not be processed. Please check the submitted content and try again.";
  return `AI request failed (${status}): ${body.slice(0, 300)}`;
}

function logAiDiagnostic(event: string, details: Record<string, unknown>) {
  if (process.env["NODE_ENV"] !== "development") return;
  console.warn(`[AI diagnostic] ${event}`, details);
}

function sanitizedDiagnosticMessage(value: unknown) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function providerErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String(error.message ?? "");
  }
  return String(error ?? "");
}

function geminiErrorCategory(error: unknown, status: number) {
  const message = providerErrorMessage(error).toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    /api key|apikey|authentication|unauthenticated|credential|permission/.test(message)
  ) {
    return "authentication";
  }
  if (status === 402) return "billing";
  if (status === 408 || /timeout|timed out/.test(message)) return "timeout";
  if (status === 429 || /quota|rate limit|resource exhausted/.test(message)) return "rate_limit";
  if (/network|fetch|timeout| connection/.test(message)) return "network";
  if (status === 502 || /malformed|parse|invalid response/.test(message)) return "response_parse";
  if (status >= 500) return "server";
  if (
    status === 404 &&
    /model|unsupported|unavailable|not found|not_found|compatib/.test(message)
  ) {
    return "compatibility";
  }
  if (status === 409 && /model|unsupported|compatib|conflict/.test(message)) {
    return "compatibility";
  }
  if (status === 400) return "invalid_request";
  return "unknown";
}

function isGeminiFallbackEligible(status: number, category: string) {
  if ([401, 402, 403, 408, 429].includes(status) || status >= 500) return true;
  return ["authentication", "billing", "compatibility", "network", "response_parse", "server", "timeout"].includes(
    category,
  );
}

function safeGeminiErrorMessage(category: string) {
  switch (category) {
    case "authentication":
      return "Gemini authentication or configuration failure.";
    case "rate_limit":
      return "Gemini rate limit or quota failure.";
    case "billing":
      return "Gemini billing or quota configuration failure.";
    case "compatibility":
      return "Gemini model or request compatibility failure.";
    case "timeout":
      return "Gemini request timed out.";
    case "server":
      return "Gemini server failure.";
    case "network":
      return "Gemini network failure.";
    case "invalid_request":
      return "Gemini rejected the request.";
    case "response_parse":
      return "Gemini returned an invalid response.";
    default:
      return "Gemini provider failure.";
  }
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
    throw new AiError("The AI response could not be parsed. Please retry.", 502);
  }
}

function buildGeminiClient() {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) {
    throw new AiError("The Gemini API key is not configured for this project.", 503, true, "gemini");
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

type AiMetrics = {
  calls: number;
  successes: number;
  failures: number;
  retries: number;
  fallbackAttempts: number;
  cacheHits: number;
};

const metrics: Record<AiProvider, AiMetrics> = {
  gemini: { calls: 0, successes: 0, failures: 0, retries: 0, fallbackAttempts: 0, cacheHits: 0 },
  groq: { calls: 0, successes: 0, failures: 0, retries: 0, fallbackAttempts: 0, cacheHits: 0 },
};

const inFlight = new Map<string, Promise<unknown>>();

export function getAiMetrics() {
  return {
    gemini: { ...metrics.gemini },
    groq: { ...metrics.groq },
  };
}

function requestKey(request: AiRequest) {
  if (!request.dedupeScope) return null;
  return JSON.stringify({
    scope: request.dedupeScope,
    system: request.system,
    user: request.user,
    images: request.images ?? [],
    model: request.model,
    temperature: request.temperature,
  });
}

function classifyProviderError(error: unknown, provider: AiProvider): AiError {
  if (error instanceof AiError) {
    error.provider = provider;
    if (provider === "gemini") {
      error.diagnosticCategory ??= geminiErrorCategory(error, error.status);
      error.retryable = isGeminiFallbackEligible(error.status, error.diagnosticCategory);
    }
    return error;
  }
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 503;
  const diagnosticCategory = provider === "gemini" ? geminiErrorCategory(error, status) : undefined;
  const retryable =
    provider === "gemini"
      ? isGeminiFallbackEligible(status, diagnosticCategory ?? "unknown")
      : status === 429 || status >= 500;
  const aiError = new AiError(
    "The AI service is temporarily unavailable.",
    status,
    retryable,
    provider,
  );
  aiError.diagnosticCategory = diagnosticCategory;
  return aiError;
}

async function runGemini<T>(request: AiRequest): Promise<T> {
  const attempts = 1;
  let lastError: AiError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    metrics.gemini.calls += 1;
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

      const result = extractJson(raw) as T;
      metrics.gemini.successes += 1;
      return result;
    } catch (error) {
      const aiError = classifyProviderError(error, "gemini");
      lastError = aiError;
      if (!aiError.retryable || attempt === attempts - 1) break;
      metrics.gemini.retries += 1;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }

  metrics.gemini.failures += 1;
  throw lastError ?? new AiError("AI request failed");
}

function buildGroqContent(request: AiRequest) {
  const content: { type: "text" | "image_url"; text?: string; image_url?: { url: string } }[] = [
    { type: "text", text: request.user },
  ];
  for (const image of (request.images ?? []).filter(Boolean).slice(0, 4)) {
    if (image) content.push({ type: "image_url", image_url: { url: image } });
  }
  return content;
}

async function runGroq<T>(request: AiRequest): Promise<T> {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) throw new AiError("The configured AI fallback is unavailable.", 503, false, "groq");

  const model =
    request.model ??
    (request.images?.some(Boolean)
      ? process.env["GROQ_VISION_MODEL"] ?? AI_MODELS.groqVision
      : process.env["GROQ_TEXT_MODEL"] ?? AI_MODELS.groqText);
  metrics.groq.calls += 1;
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: buildGroqContent(request) },
        ],
        temperature: request.temperature ?? 0.2,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    logAiDiagnostic("groq-transport-failure", {
      model,
      errorCode: "transport_error",
      errorMessage: "The fallback request could not be sent.",
    });
    metrics.groq.failures += 1;
    throw new AiError("The AI fallback service is temporarily unavailable.", 503, true, "groq");
  }

  logAiDiagnostic("groq-http-response", { status: response.status, model });
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: { code?: unknown; message?: unknown };
      };
      errorCode = typeof body.error?.code === "string" ? body.error.code : undefined;
      errorMessage = sanitizedDiagnosticMessage(body.error?.message);
    } catch {
      // Preserve the existing generic error when the provider body is not JSON.
    }
    logAiDiagnostic("groq-failure", {
      status: response.status,
      model,
      errorCode: errorCode ?? "unknown",
      errorMessage: errorMessage || "The fallback provider rejected the request.",
    });
    metrics.groq.failures += 1;
    throw new AiError(
      friendly(response.status, "The fallback provider rejected the request."),
      response.status,
      retryable,
      "groq",
    );
  }

  let payload: { choices?: { message?: { content?: string | null } }[] };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    logAiDiagnostic("groq-response-parse-failure", {
      status: response.status,
      model,
      errorCode: "invalid_response",
      errorMessage: "The fallback response was not valid JSON.",
    });
    metrics.groq.failures += 1;
    throw new AiError("The AI fallback returned an invalid response.", 502, false, "groq");
  }
  const raw = payload.choices?.[0]?.message?.content ?? "";
  if (!raw.trim()) {
    logAiDiagnostic("groq-empty-response", {
      status: response.status,
      model,
      errorCode: "empty_response",
      errorMessage: "The fallback response did not contain assistant content.",
    });
    metrics.groq.failures += 1;
    throw new AiError("The AI fallback returned an empty response.", 502, false, "groq");
  }
  try {
    const result = extractJson(raw) as T;
    logAiDiagnostic("groq-json-parse-success", { model });
    metrics.groq.successes += 1;
    return result;
  } catch {
    logAiDiagnostic("groq-json-parse-failure", { model });
    metrics.groq.failures += 1;
    throw new AiError("The AI fallback returned malformed JSON.", 502, false, "groq");
  }
}

/** Calls Gemini first, then Groq only for eligible Gemini provider failures. */
export async function runAiJson<T>(request: AiRequest): Promise<T> {
  const key = requestKey(request);
  if (key) {
    const existing = inFlight.get(key);
    if (existing) {
      metrics.gemini.cacheHits += 1;
      return existing as Promise<T>;
    }
  }

  const operation = (async () => {
    try {
      return await runGemini<T>(request);
    } catch (error) {
      const geminiError = classifyProviderError(error, "gemini");
      const fallbackEligible = geminiError.retryable && !!process.env["GROQ_API_KEY"];
      const category = geminiError.diagnosticCategory ?? geminiErrorCategory(error, geminiError.status);
      logAiDiagnostic("gemini-failure-classified", {
        provider: "gemini",
        status: geminiError.status,
        fallbackEligible,
        category,
        errorMessage: safeGeminiErrorMessage(category),
      });
      if (!fallbackEligible) {
        throw geminiError;
      }
      metrics.gemini.fallbackAttempts += 1;
      const hasImages = request.images?.some(Boolean) ?? false;
      const model =
        request.model ??
        (hasImages
          ? process.env["GROQ_VISION_MODEL"] ?? AI_MODELS.groqVision
          : process.env["GROQ_TEXT_MODEL"] ?? AI_MODELS.groqText);
      logAiDiagnostic("groq-fallback-start", { model, hasImages });
      return runGroq<T>(request);
    }
  })();

  if (key) {
    inFlight.set(key, operation);
    operation.finally(() => inFlight.delete(key)).catch(() => undefined);
  }
  return operation;
}

export function clampConfidence(value: unknown, fallback = 0.6) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const scaled = num > 1 ? num / 100 : num;
  return Math.min(1, Math.max(0, scaled));
}

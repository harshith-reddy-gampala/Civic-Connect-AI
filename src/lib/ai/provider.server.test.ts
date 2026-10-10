import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { AiError, AI_MODELS, runAiJson } from "./provider.server";

describe("runAiJson", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env["GEMINI_API_KEY"];
    delete process.env["GROQ_API_KEY"];
    delete process.env["GROQ_VISION_MODEL"];
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a text-only request using the default Gemini model", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";
    generateContentMock.mockResolvedValue({ text: '{"ok":true}' });

    const result = await runAiJson({ system: "sys", user: "hello" });

    expect(result).toEqual({ ok: true });
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: AI_MODELS.text,
        config: expect.objectContaining({
          temperature: 0.2,
          responseMimeType: "application/json",
        }),
      }),
    );
  });

  it("converts a single complaint image into inline Gemini data", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    } as unknown as Response);
    generateContentMock.mockResolvedValue({ text: '{"category":"roads"}' });

    await runAiJson({
      system: "sys",
      user: "analyze complaint",
      images: ["https://example.com/pothole.jpg"],
    });

    const [{ contents }] = generateContentMock.mock.calls[0] ?? [];
    expect(contents[0].parts).toHaveLength(2);
    expect(contents[0].parts[1]).toEqual(
      expect.objectContaining({
        inlineData: expect.objectContaining({ mimeType: "image/jpeg" }),
      }),
    );
  });

  it("handles two images for repair verification", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    } as unknown as Response);
    generateContentMock.mockResolvedValue({ text: '{"verdict":"repair_completed"}' });

    await runAiJson({
      system: "sys",
      user: "compare before after",
      images: ["https://example.com/before.png", "https://example.com/after.png"],
    });

    const [{ contents }] = generateContentMock.mock.calls[0] ?? [];
    expect(contents[0].parts).toHaveLength(3);
  });

  it("rejects invalid images without calling a provider", async () => {
    process.env["GEMINI_API_KEY"] = "test-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";

    await expect(
      runAiJson({ system: "sys", user: "bad image", images: ["https://example.com/bad.svg"] }),
    ).rejects.toBeInstanceOf(AiError);
    expect(generateContentMock).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("https://example.com/bad.svg");
  });

  it("falls back when Gemini configuration is missing", async () => {
    process.env["GROQ_API_KEY"] = "test-groq-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello" })).resolves.toEqual({ ok: true });
  });

  it("falls back after a Gemini network failure without another Gemini retry", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    generateContentMock.mockRejectedValue(new Error("temporary upstream failure"));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello", retries: 3 })).resolves.toEqual({
      ok: true,
    });
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it.each([401, 402, 403, 408, 429, 503])("falls back for Gemini HTTP %s", async (status) => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    generateContentMock.mockRejectedValue(new AiError("provider failure", status));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello" })).resolves.toEqual({ ok: true });
  });

  it("falls back for a Gemini SDK 400 authentication-shaped error", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env["NODE_ENV"] = "development";
    generateContentMock.mockRejectedValue({
      status: 400,
      message: '{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"Invalid API key"}}',
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello" })).resolves.toEqual({ ok: true });
    expect(warning).toHaveBeenCalledWith(
      "[AI diagnostic] gemini-failure-classified",
      expect.objectContaining({
        provider: "gemini",
        status: 400,
        fallbackEligible: true,
        category: "authentication",
        errorMessage: "Gemini authentication or configuration failure.",
      }),
    );
    warning.mockRestore();
    delete process.env["NODE_ENV"];
  });

  it("does not fall back for a structurally invalid Gemini 400 request", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";

    await expect(
      runAiJson({ system: "sys", user: "hello", images: ["data:image/gif;base64,AAAA"] }),
    ).rejects.toMatchObject({
      status: 400,
      provider: "gemini",
      retryable: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back for a Gemini authentication error", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    generateContentMock.mockRejectedValue(new AiError("unauthorized", 401));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello" })).resolves.toEqual({ ok: true });
  });

  it("falls back for malformed Gemini JSON", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    generateContentMock.mockResolvedValue({ text: "not-json" });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello" })).resolves.toEqual({ ok: true });
  });

  it("does not fall back for a valid negative decision", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    generateContentMock.mockResolvedValue({
      text: '{"imageRelevant":false,"imageScreening":{"verdict":"uncertain"}}',
    });

    await expect(runAiJson({ system: "sys", user: "screen image" })).resolves.toMatchObject({
      imageRelevant: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the configured Groq vision model and preserves image inputs", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    process.env["GROQ_VISION_MODEL"] = "test-vision-model";
    generateContentMock.mockRejectedValue(new Error("vision provider unavailable"));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(
      runAiJson({
        system: "sys",
        user: "screen image",
        images: ["data:image/jpeg;base64,AAAA"],
      }),
    ).resolves.toEqual({ ok: true });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("test-vision-model");
    expect(JSON.stringify(body)).toContain("image_url");
  });

  it("fails safely when Groq returns malformed JSON", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    generateContentMock.mockRejectedValue(new Error("temporary upstream failure"));
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "not-json" } }] }),
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello" })).rejects.toMatchObject({
      status: 502,
      provider: "groq",
    });
  });

  it("fails safely when both providers fail", async () => {
    process.env["GEMINI_API_KEY"] = "test-gemini-key";
    process.env["GROQ_API_KEY"] = "test-groq-key";
    generateContentMock.mockRejectedValue(new Error("temporary upstream failure"));
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "unavailable",
    } as Response);

    await expect(runAiJson({ system: "sys", user: "hello" })).rejects.toMatchObject({
      status: 503,
      provider: "groq",
    });
  });
});

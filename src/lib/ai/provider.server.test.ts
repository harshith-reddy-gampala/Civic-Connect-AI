import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: generateContentMock };
    }
  },
}));

import { AiError, AI_MODELS, runAiJson } from "./provider.server";

describe("runAiJson", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.GEMINI_API_KEY;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a text-only request using the default Gemini model", async () => {
    process.env.GEMINI_API_KEY = "test-key";
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
    process.env.GEMINI_API_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    } as Response);
    generateContentMock.mockResolvedValue({ text: '{"category":"roads"}' });

    await runAiJson({
      system: "sys",
      user: "analyze complaint",
      images: ["https://example.com/pothole.jpg"],
    });

    const [{ contents }] = generateContentMock.mock.calls[0];
    expect(contents[0].parts).toHaveLength(2);
    expect(contents[0].parts[1]).toEqual(
      expect.objectContaining({
        inlineData: expect.objectContaining({ mimeType: "image/jpeg" }),
      }),
    );
  });

  it("handles two images for repair verification", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
    } as Response);
    generateContentMock.mockResolvedValue({ text: '{"verdict":"repair_completed"}' });

    await runAiJson({
      system: "sys",
      user: "compare before after",
      images: ["https://example.com/before.png", "https://example.com/after.png"],
    });

    const [{ contents }] = generateContentMock.mock.calls[0];
    expect(contents[0].parts).toHaveLength(3);
  });

  it("throws a helpful error for invalid images", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    await expect(
      runAiJson({ system: "sys", user: "bad image", images: ["https://example.com/bad.svg"] }),
    ).rejects.toBeInstanceOf(AiError);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("throws when the Gemini API key is missing", async () => {
    await expect(runAiJson({ system: "sys", user: "hello" })).rejects.toMatchObject({
      status: 500,
    });
  });

  it("rejects invalid JSON output from Gemini", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockResolvedValue({ text: "not-json" });

    await expect(runAiJson({ system: "sys", user: "bad output" })).rejects.toThrow(
      /could not be parsed/i,
    );
  });
});

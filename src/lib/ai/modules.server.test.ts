import { describe, expect, it, vi } from "vitest";

const { runAiJsonMock } = vi.hoisted(() => ({
  runAiJsonMock: vi.fn(),
}));

vi.mock("@/lib/ai/provider.server", () => ({
  clampConfidence: (value: unknown, fallback = 0.6) => {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? Math.min(1, Math.max(0, number > 1 ? number / 100 : number)) : fallback;
  },
  runAiJson: runAiJsonMock,
}));

import { normalizeImageScreening, understandComplaint, verifyRepair } from "./modules.server";

describe("normalizeImageScreening", () => {
  it("normalizes a valid authentic result", () => {
    expect(
      normalizeImageScreening({
        verdict: "likely_authentic",
        confidence: 0.91,
        reason: "No strong synthetic-image indicators were observed.",
      }),
    ).toEqual({
      verdict: "likely_authentic",
      confidence: 0.91,
      reason: "No strong synthetic-image indicators were observed.",
    });
  });

  it("never defaults malformed results to authentic", () => {
    expect(normalizeImageScreening({ verdict: "likely_authentic" })).toMatchObject({
      verdict: "uncertain",
      confidence: 0,
    });
  });

  it("downgrades low-confidence suspicious results to uncertain", () => {
    expect(
      normalizeImageScreening({
        verdict: "likely_ai_generated",
        confidence: 0.84,
        reason: "Some synthetic-looking texture was observed.",
      }),
    ).toMatchObject({ verdict: "uncertain", confidence: 0.84 });
  });

  it("preserves high-confidence suspicious results", () => {
    expect(
      normalizeImageScreening({
        verdict: "likely_manipulated",
        confidence: 0.9,
        reason: "Lighting and perspective appear inconsistent.",
      }),
    ).toEqual({
      verdict: "likely_manipulated",
      confidence: 0.9,
      reason: "Lighting and perspective appear inconsistent.",
    });
  });
});

describe("AI fallback payload normalization", () => {
  it("normalizes a representative Groq complaint-understanding response", async () => {
    runAiJsonMock.mockResolvedValue({
      infrastructureType: "asphalt road surface",
      category: "roads",
      severity: "high",
      suggestedDepartmentCode: "ROAD",
      summary: "A pothole is visible in the roadway.",
      confidence: 0.88,
      imageRelevant: true,
      imageRelevanceReason: "The damaged road surface matches the complaint.",
      imageScreening: {
        verdict: "likely_authentic",
        confidence: 0.9,
        reason: "No strong synthetic-image indicators were observed.",
      },
    });

    await expect(
      understandComplaint({
        title: "Pothole",
        description: "There is a pothole in the road.",
        address: "1 Main Street",
        imageUrl: "data:image/jpeg;base64,AAAA",
      }),
    ).resolves.toMatchObject({
      category: "roads",
      imageRelevant: true,
      imageScreening: {
        verdict: "likely_authentic",
        confidence: 0.9,
      },
    });
  });

  it("normalizes a representative Groq repair-verification response", async () => {
    runAiJsonMock.mockResolvedValue({
      verdict: "needs_reinspection",
      confidence: 0.86,
      notes: "The original defect remains visible.",
      observations: ["The same road segment is shown.", "The pothole remains open."],
    });

    await expect(
      verifyRepair({
        title: "Pothole",
        description: "There is a pothole in the road.",
        category: "roads",
        remarks: "Repair completed.",
        beforeImageUrl: "data:image/jpeg;base64,BEFORE",
        afterImageUrl: "data:image/jpeg;base64,AFTER",
      }),
    ).resolves.toEqual({
      verdict: "needs_reinspection",
      confidence: 0.86,
      notes: "The original defect remains visible.",
      observations: ["The same road segment is shown.", "The pothole remains open."],
    });
  });
});

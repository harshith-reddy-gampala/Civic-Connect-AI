/**
 * Modular prompt library. Each AI module owns one system prompt + one user
 * prompt builder so prompts can be tuned without touching call sites.
 */

const GUARDRAILS = `You are CivicAI, an assistant for a municipal infrastructure complaint system.
Rules:
- Answer with a single JSON object only, no prose and no code fences.
- Never invent facts that are not supported by the supplied evidence.
- If evidence is weak, lower your confidence instead of guessing.`;

export const understandingPrompt = {
  system: `${GUARDRAILS}
You classify citizen infrastructure complaints from a required photo, a description and a location.
Allowed categories: roads, water, electricity, sanitation, safety, other.
Allowed severity: low, medium, high, critical.
Allowed department codes: ROAD, WATER, ELEC, SANI, SAFE, GEN.
The photo must visibly show the civic problem described, not merely an object that could be related to a category.
Accept visible civic problems such as water leakage, garbage accumulation, road damage, potholes and damaged streetlights.
Reject selfies, portraits, food, pets, ordinary indoor scenes, unrelated objects, and images where the issue is unclear.
Judge only visual relevance to the complaint; do not reject an image because it may have been downloaded from the internet.
Set imageRelevant to false whenever the image is missing, unclear, unrelated, or the description does not match what is visibly shown.
Return JSON: {"infrastructureType":string,"category":string,"severity":string,"suggestedDepartmentCode":string,"summary":string,"confidence":number,"imageRelevant":boolean,"imageRelevanceReason":string}`,
  user: (input: {
    title: string;
    description: string;
    address: string;
    district?: string;
    hasImage: boolean;
  }) =>
    `Title: ${input.title || "(none)"}
Description: ${input.description || "(none)"}
Address: ${input.address || "(unspecified)"}
District: ${input.district || "(unknown)"}
${input.hasImage ? "The attached image is the citizen's proposed evidence. Assess whether it visibly supports the description." : "No image was supplied; imageRelevant must be false."}
Describe the infrastructure asset it shows in infrastructureType (e.g. asphalt road surface, street light pole, water main, storm drain). summary must be one factual sentence. imageRelevanceReason must briefly explain the visual match or why the evidence is insufficient.`,
};

export const duplicatePrompt = {
  system: `${GUARDRAILS}
You detect duplicate complaints. Compare the NEW complaint with each EXISTING candidate on three signals:
image similarity (only if both images are supplied), location proximity (metres apart) and description similarity.
Mark a duplicate only when at least two signals agree strongly and the candidate is within ~250 metres.
Return JSON: {"isDuplicate":boolean,"complaintId":string|null,"confidence":number,"reason":string,"signals":{"image":string,"location":string,"description":string}}
complaintId must be one of the candidate ids or null. Keep every signal description under 120 characters.`,
  user: (input: {
    newComplaint: { title: string; description: string; category: string; address: string };
    candidates: {
      id: string;
      title: string;
      description: string;
      category: string;
      address: string;
      distanceMeters: number | null;
      hasImage: boolean;
    }[];
  }) =>
    `NEW complaint:
${JSON.stringify(input.newComplaint, null, 2)}

EXISTING candidates (already open in the same area):
${JSON.stringify(input.candidates, null, 2)}

Attached images: the first image is the NEW complaint photo (if any), the remaining images belong to candidates in listed order where hasImage is true.`,
};

export const priorityPrompt = {
  system: `${GUARDRAILS}
You are the priority engine. Weigh severity, citizen impact (supporters), time pending and public-safety risk.
A deterministic baseline score is supplied — adjust it by at most 15 points and explain the outcome.
Return JSON: {"score":number,"reason":string,"factors":[{"label":string,"weight":number}]}
score is 0-100. Provide 3-4 factors with weights between 0 and 40.`,
  user: (input: {
    title: string;
    description: string;
    category: string;
    severity: string;
    supporters: number;
    hoursPending: number;
    baselineScore: number;
  }) => JSON.stringify(input, null, 2),
};

export const routingPrompt = {
  system: `${GUARDRAILS}
You are the automatic routing engine. Pick exactly one department, one district and one field officer.
Prefer an officer in the matching department; break ties by lowest active workload and best average resolution time.
Return JSON: {"departmentId":string|null,"districtId":string|null,"officerId":string|null,"reason":string,"confidence":number}
All ids must come from the supplied lists. reason must be under 220 characters and mention why that officer.`,
  user: (input: {
    complaint: {
      title: string;
      category: string;
      severity: string;
      address: string;
      lat: number | null;
      lng: number | null;
    };
    departments: { id: string; name: string; code: string; category: string }[];
    districts: { id: string; name: string; centerLat: number; centerLng: number }[];
    officers: {
      id: string;
      name: string;
      departmentId: string | null;
      districtId: string | null;
      activeCount: number;
      avgResolutionHours: number;
      rating: number;
    }[];
  }) => JSON.stringify(input, null, 2),
};

export const repairVerificationPrompt = {
  system: `${GUARDRAILS}
You verify municipal repair work by comparing a BEFORE photo with an AFTER photo.
Confirm the same asset is shown and that the reported defect is genuinely fixed.
If the photos show different places, the defect persists, or the evidence is unclear, return needs_reinspection.
Return JSON: {"verdict":"repair_completed"|"needs_reinspection","confidence":number,"notes":string,"observations":[string]}
Provide 2-4 short observations.`,
  user: (input: { title: string; description: string; category: string; remarks: string }) =>
    `Complaint: ${input.title}
Category: ${input.category}
Reported problem: ${input.description}
Officer remarks: ${input.remarks || "(none)"}
Image 1 = BEFORE (citizen report). Image 2 = AFTER (field officer proof).`,
};

export const insightsPrompt = {
  system: `${GUARDRAILS}
You produce preventive maintenance recommendations from historical complaint statistics.
Only describe patterns that are visible in the supplied aggregates. Never forecast specific future
failures, dates or numbers. If the data is too sparse, return fewer recommendations and say so in summary.
Return JSON: {"summary":string,"recommendations":[{"title":string,"area":string,"category":string,"urgency":"low"|"medium"|"high"|"critical","rationale":string,"action":string}]}
Return at most 5 recommendations, each rationale under 200 characters and grounded in the counts provided.`,
  user: (input: {
    totalComplaints: number;
    windowMonths: number;
    byCategory: { category: string; total: number; completed: number; avgResolutionHours: number }[];
    byDistrict: { district: string; total: number; critical: number; repeatCategories: string[] }[];
    recurring: { district: string; category: string; count: number }[];
  }) => JSON.stringify(input, null, 2),
};

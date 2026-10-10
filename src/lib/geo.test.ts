import { describe, expect, it } from "vitest";

import { distanceMeters, filterByRadius } from "@/lib/geo";

const origin = { lat: 17.385044, lng: 78.486671 };

describe("filterByRadius", () => {
  it("includes complaints within 3 km", () => {
    const within = { id: "within", lat: origin.lat, lng: origin.lng + 0.01 };

    expect(filterByRadius([within], origin, 3_000)).toEqual([within]);
  });

  it("includes a complaint exactly 3 km away", () => {
    const longitudeDelta = 3_000 / (111_320 * Math.cos((origin.lat * Math.PI) / 180));
    const boundary = { id: "boundary", lat: origin.lat, lng: origin.lng + longitudeDelta };

    expect(distanceMeters(origin, boundary)).toBeLessThanOrEqual(3_000);
    expect(filterByRadius([boundary], origin, 3_000)).toEqual([boundary]);
  });

  it("excludes complaints beyond 3 km", () => {
    const beyond = { id: "beyond", lat: origin.lat, lng: origin.lng + 0.04 };

    expect(filterByRadius([beyond], origin, 3_000)).toEqual([]);
  });

  it("excludes complaints with null or invalid coordinates", () => {
    const valid = { id: "valid", lat: origin.lat, lng: origin.lng };
    const invalid = { id: "invalid", lat: 200, lng: origin.lng };
    const missing = { id: "missing", lat: null, lng: null };

    expect(filterByRadius([valid, invalid, missing], origin, 3_000)).toEqual([valid]);
  });
});

export type Coordinate = {
  lat: number;
  lng: number;
};

export type CoordinateRecord = {
  lat: number | null;
  lng: number | null;
};

export function isValidCoordinate(value: CoordinateRecord): value is CoordinateRecord & Coordinate {
  return (
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    typeof value.lng === "number" &&
    Number.isFinite(value.lng) &&
    value.lng >= -180 &&
    value.lng <= 180
  );
}

export function distanceMeters(a: Coordinate, b: Coordinate) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return Math.round(
    2 * earthRadiusMeters * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine)))),
  );
}

export function filterByRadius<T extends CoordinateRecord>(
  rows: T[],
  origin: Coordinate,
  radiusMeters: number,
) {
  return rows.filter(
    (row) => isValidCoordinate(row) && distanceMeters(origin, row) <= radiusMeters,
  );
}

/**
 * Application-wide constants. Keep tunables here so behaviour can be adjusted
 * in one place instead of being scattered through feature code.
 */

/** Rows rendered per page in list views before "Load more". */
export const PAGE_SIZE = 8;

/** React Query cache windows (ms). */
export const STALE_TIME = {
  reference: 10 * 60 * 1000, // districts, departments — rarely change
  list: 30 * 1000, // complaint lists
  detail: 15 * 1000, // single complaint
  notifications: 15 * 1000,
} as const;

/** Fallback map centre (Pune) used when no geo-tagged report is available. */
export const DEFAULT_MAP_CENTER = { lat: 18.5204, lng: 73.8567 } as const;

/** Client-side input limits — mirrored by database constraints and RLS. */
export const LIMITS = {
  titleMin: 6,
  titleMax: 120,
  descriptionMin: 15,
  descriptionMax: 1200,
  addressMax: 200,
  remarksMax: 600,
  imageMaxBytes: 5 * 1024 * 1024,
  imageTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
} as const;

/** Months of history used by trend/insight aggregations. */
export const TREND_MONTHS = 6;

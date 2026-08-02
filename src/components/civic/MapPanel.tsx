import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRIORITY_META, type ComplaintPriority } from "@/lib/civic";

const TILE = 256;

function project(lat: number, lng: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  priority: ComplaintPriority;
  meta?: string;
};

const markerTone: Record<ComplaintPriority, string> = {
  low: "bg-muted-foreground",
  medium: "bg-info",
  high: "bg-warning",
  critical: "bg-critical",
};

/**
 * Lightweight OpenStreetMap tile viewer — no external map SDK, so it renders
 * instantly inside dashboards. Markers are absolutely positioned from the
 * projected pixel offset of the map centre.
 */
export function MapPanel({
  center,
  markers,
  zoom = 13,
  height = "h-[380px]",
  className,
}: {
  center: { lat: number; lng: number };
  markers: MapMarker[];
  zoom?: number;
  height?: string;
  className?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const centerPx = useMemo(() => project(center.lat, center.lng, zoom), [center, zoom]);

  const tiles = useMemo(() => {
    const centerTileX = Math.floor(centerPx.x / TILE);
    const centerTileY = Math.floor(centerPx.y / TILE);
    const out: { key: string; url: string; left: number; top: number }[] = [];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        if (ty < 0 || ty >= 2 ** zoom) continue;
        const wrapped = ((tx % 2 ** zoom) + 2 ** zoom) % 2 ** zoom;
        out.push({
          key: `${tx}-${ty}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`,
          left: tx * TILE - centerPx.x,
          top: ty * TILE - centerPx.y,
        });
      }
    }
    return out;
  }, [centerPx, zoom]);

  return (
    <div
      className={cn(
        "surface-card relative overflow-hidden bg-muted p-0",
        height,
        className,
      )}
    >
      <div className="absolute inset-0">
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={tile.url}
            alt=""
            loading="lazy"
            width={TILE}
            height={TILE}
            className="pointer-events-none absolute opacity-95 dark:opacity-70 dark:contrast-125 dark:invert dark:hue-rotate-180"
            style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }}
          />
        ))}

        {markers.map((marker) => {
          const px = project(marker.lat, marker.lng, zoom);
          return (
            <button
              key={marker.id}
              type="button"
              onClick={() => setActive(active === marker.id ? null : marker.id)}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{
                left: `calc(50% + ${px.x - centerPx.x}px)`,
                top: `calc(50% + ${px.y - centerPx.y}px)`,
              }}
              aria-label={marker.label}
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full border-2 border-card text-card shadow-card",
                  markerTone[marker.priority],
                )}
              >
                <MapPin className="size-3.5 text-card" />
              </span>
              {active === marker.id ? (
                <span className="absolute bottom-9 left-1/2 w-52 -translate-x-1/2 rounded-xl border border-border bg-popover p-3 text-left shadow-float">
                  <span className="block text-xs font-semibold text-popover-foreground">
                    {marker.label}
                  </span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {marker.meta} · {PRIORITY_META[marker.priority].label} priority
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute right-3 bottom-2 rounded-md bg-card/85 px-2 py-1 text-[10px] text-muted-foreground">
        © OpenStreetMap contributors
      </div>
    </div>
  );
}

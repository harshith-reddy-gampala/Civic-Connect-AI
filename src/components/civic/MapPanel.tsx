import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRIORITY_META, type ComplaintPriority } from "@/lib/civic";

const TILE = 256;
const MIN_ZOOM = 8;
const MAX_ZOOM = 18;
const DEFAULT_ZOOM = 13;
const MAP_PADDING = 32;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function project(lat: number, lng: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function unproject(x: number, y: number, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const lat =
    ((2 * Math.atan(Math.exp(Math.PI * (1 - (2 * y) / scale))) - Math.PI / 2) * 180) / Math.PI;

  return { lat, lng };
}

function getMarkerFit(markers: MapMarker[], viewportWidth: number, viewportHeight: number) {
  if (markers.length === 0) {
    return null;
  }

  const minLat = Math.min(...markers.map((marker) => marker.lat));
  const maxLat = Math.max(...markers.map((marker) => marker.lat));
  const minLng = Math.min(...markers.map((marker) => marker.lng));
  const maxLng = Math.max(...markers.map((marker) => marker.lng));

  const projectedAtDefault = markers.map((marker) => project(marker.lat, marker.lng, DEFAULT_ZOOM));
  const minX = Math.min(...projectedAtDefault.map((point) => point.x));
  const maxX = Math.max(...projectedAtDefault.map((point) => point.x));
  const minY = Math.min(...projectedAtDefault.map((point) => point.y));
  const maxY = Math.max(...projectedAtDefault.map((point) => point.y));

  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const fitRatio = Math.min(
    (viewportWidth - MAP_PADDING * 2) / (spanX * 1.1),
    (viewportHeight - MAP_PADDING * 2) / (spanY * 1.1),
  );

  const zoom = clamp(DEFAULT_ZOOM + Math.log2(Math.max(fitRatio, 0.2)), MIN_ZOOM, MAX_ZOOM);

  return {
    center: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    },
    zoom,
  };
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
 * instantly inside dashboards. Markers are positioned from stored complaint
 * coordinates and the map auto-fits the district marker set for the officer view.
 */
export function MapPanel({
  center,
  markers,
  zoom = DEFAULT_ZOOM,
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
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [view, setView] = useState({ center, zoom });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originCenter: { lat: number; lng: number };
  } | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      setViewport({
        width: node.clientWidth || 0,
        height: node.clientHeight || 0,
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!markers.length) {
      setView({ center, zoom });
      return;
    }

    const nextFit = getMarkerFit(markers, viewport.width || 900, viewport.height || 440);
    if (nextFit) {
      setView(nextFit);
    }
  }, [center, markers, viewport.height, viewport.width, zoom]);

  const centerPx = useMemo(() => project(view.center.lat, view.center.lng, view.zoom), [view.center, view.zoom]);

  const tiles = useMemo(() => {
    const centerTileX = Math.floor(centerPx.x / TILE);
    const centerTileY = Math.floor(centerPx.y / TILE);
    const out: { key: string; url: string; left: number; top: number }[] = [];
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        if (ty < 0 || ty >= 2 ** view.zoom) continue;
        const wrapped = ((tx % 2 ** view.zoom) + 2 ** view.zoom) % 2 ** view.zoom;
        out.push({
          key: `${tx}-${ty}`,
          url: `https://tile.openstreetmap.org/${view.zoom}/${wrapped}/${ty}.png`,
          left: tx * TILE - centerPx.x,
          top: ty * TILE - centerPx.y,
        });
      }
    }
    return out;
  }, [centerPx, view.zoom]);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setView((current) => ({
      ...current,
      zoom: clamp(current.zoom + (event.deltaY < 0 ? 1 : -1), MIN_ZOOM, MAX_ZOOM),
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originCenter: view.center,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    const originPx = project(dragRef.current.originCenter.lat, dragRef.current.originCenter.lng, view.zoom);
    const nextPx = { x: originPx.x - dx, y: originPx.y - dy };
    const nextCenter = unproject(nextPx.x, nextPx.y, view.zoom);

    setView((current) => ({
      ...current,
      center: nextCenter,
    }));
  };

  const handlePointerEnd = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "surface-card relative overflow-hidden bg-muted p-0",
        height,
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onWheel={handleWheel}
      style={{ touchAction: "none" }}
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
          const px = project(marker.lat, marker.lng, view.zoom);
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

      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setView((current) => ({ ...current, zoom: clamp(current.zoom + 1, MIN_ZOOM, MAX_ZOOM) }))}
          aria-label="Zoom in"
          className="grid size-9 place-items-center rounded-md border border-border bg-card/90 text-muted-foreground shadow-sm hover:bg-card"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setView((current) => ({ ...current, zoom: clamp(current.zoom - 1, MIN_ZOOM, MAX_ZOOM) }))}
          aria-label="Zoom out"
          className="grid size-9 place-items-center rounded-md border border-border bg-card/90 text-muted-foreground shadow-sm hover:bg-card"
        >
          <Minus className="size-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute right-3 bottom-2 rounded-md bg-card/85 px-2 py-1 text-[10px] text-muted-foreground">
        © OpenStreetMap contributors
      </div>
    </div>
  );
}

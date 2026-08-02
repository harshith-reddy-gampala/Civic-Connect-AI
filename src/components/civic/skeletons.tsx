import { Skeleton } from "@/components/ui/skeleton";

/** Staggered fade so skeleton grids feel composed rather than flashing at once. */
function stagger(index: number) {
  return { animationDelay: `${index * 60}ms` } as React.CSSProperties;
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface-card animate-fade-in p-5" style={stagger(index)}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="size-10 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="surface-card animate-fade-in space-y-4 p-5" style={stagger(index)}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="surface-card animate-fade-in p-5">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <div className="mt-5 flex items-end gap-2" style={{ height }}>
        {[52, 74, 38, 88, 61, 96, 44, 70].map((value, index) => (
          <Skeleton key={index} className="flex-1 rounded-t-lg" style={{ height: `${value}%` }} />
        ))}
      </div>
    </div>
  );
}

export function MapSkeleton() {
  return <Skeleton className="h-[320px] w-full rounded-2xl" />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="surface-card space-y-3 p-5">
      <Skeleton className="h-3.5 w-40" />
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-4 gap-3" style={stagger(index)}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="surface-card divide-y divide-border p-0">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2 px-4 py-3.5" style={stagger(index)}>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <div className="surface-card animate-fade-in space-y-4 p-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="surface-card animate-fade-in grid gap-4 p-6 sm:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
      <div className="space-y-6">
        <MapSkeleton />
        <div className="surface-card animate-fade-in space-y-4 p-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2" style={stagger(index)}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

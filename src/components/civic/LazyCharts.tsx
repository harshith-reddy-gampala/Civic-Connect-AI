import { lazy, Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Recharts is heavy (~100kb). Charts are loaded on demand so dashboards paint
 * their KPI row and lists before the visualisation bundle arrives.
 */
const TrendChartLazy = lazy(() =>
  import("@/components/civic/charts").then((m) => ({ default: m.TrendChart })),
);
const CategoryChartLazy = lazy(() =>
  import("@/components/civic/charts").then((m) => ({ default: m.CategoryChart })),
);
const StatusPieLazy = lazy(() =>
  import("@/components/civic/charts").then((m) => ({ default: m.StatusPie })),
);

function ChartFallback() {
  return (
    <div className="flex h-full items-end gap-2" aria-hidden="true">
      {[48, 72, 36, 84, 58, 92, 44, 66].map((value, index) => (
        <Skeleton key={index} className="flex-1 rounded-t-lg" style={{ height: `${value}%` }} />
      ))}
    </div>
  );
}

type Series = { label: string; value: number }[];

export function TrendChart(props: { data: { label: string; reports: number; resolved: number }[] }) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <TrendChartLazy {...props} />
    </Suspense>
  );
}

export function CategoryChart(props: { data: Series }) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <CategoryChartLazy {...props} />
    </Suspense>
  );
}

export function StatusPie(props: { data: Series }) {
  return (
    <Suspense fallback={<ChartFallback />}>
      <StatusPieLazy {...props} />
    </Suspense>
  );
}

export { ChartFrame } from "@/components/civic/ChartFrame";

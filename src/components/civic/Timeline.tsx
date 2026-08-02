import { STATUS_META } from "@/lib/civic";
import type { StatusHistory } from "@/lib/queries";

export function Timeline({ history }: { history: StatusHistory[] }) {
  if (!history.length) {
    return <p className="text-sm text-muted-foreground">No updates recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {history.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute top-1 -left-[31px] size-3 rounded-full border-2 border-card bg-primary" />
          <p className="text-sm font-semibold">{STATUS_META[entry.status].label}</p>
          {entry.remarks ? (
            <p className="mt-1 text-sm text-muted-foreground">{entry.remarks}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.changed_by_name} · {new Date(entry.created_at).toLocaleString()}
          </p>
        </li>
      ))}
    </ol>
  );
}

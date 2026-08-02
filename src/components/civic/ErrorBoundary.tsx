import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/error-reporting";

/**
 * Inline error state for failed data fetches. Always pair a query error with a
 * retry affordance — never a silent blank panel.
 */
export function DataErrorState({
  title = "Could not load this data",
  message,
  onRetry,
  pending,
}: {
  title?: string | undefined;
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
  pending?: boolean | undefined;
}) {
  return (
    <div
      role="alert"
      className="surface-card animate-fade-in flex flex-col items-center px-6 py-10 text-center"
    >
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-critical/12 text-critical">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        {message || "The request failed. This is usually temporary."}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry} disabled={pending}>
          <RefreshCw className={`mr-2 size-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
          {pending ? "Retrying…" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}

type State = { error: Error | null };

/**
 * Section-level error boundary. Keeps a single failing panel from taking down
 * the whole workspace, and reports the error for diagnostics.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string; fallback?: ReactNode },
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      boundary: this.props.label ?? "civic_error_boundary",
      componentStack: info.componentStack ?? "",
    });
  }

  override render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <DataErrorState
          title="Something went wrong in this section"
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

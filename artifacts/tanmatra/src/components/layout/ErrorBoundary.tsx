import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

const REPORT_ENDPOINT = `${import.meta.env.BASE_URL}api/error-report`;

function postReport(payload: {
  message: string;
  stack: string | null;
  componentStack: string | null;
  href: string;
}): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(REPORT_ENDPOINT, blob);
      return;
    }
    void fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow — beacon is best-effort */
    });
  } catch {
    /* swallow — never let reporting itself crash the boundary */
  }
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }

  componentDidCatch(err: unknown, info: ErrorInfo): void {
    postReport({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
      componentStack: info.componentStack ?? null,
      href: typeof window !== "undefined" ? window.location.href : "",
    });
  }

  handleReload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="min-h-screen flex items-center justify-center bg-clinical-dark px-6">
        <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <h1 className="text-xl font-semibold text-white">
            Something went wrong
          </h1>
          <p className="text-sm text-white/60">
            The page hit an unexpected error and couldn&rsquo;t finish loading.
            Reloading usually fixes it. If the problem keeps happening, please
            let our support team know.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center justify-center rounded-full bg-white text-black px-5 py-2 text-sm font-medium hover:bg-white/90 transition"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

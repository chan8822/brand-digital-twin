import { Navigate, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { apiPath } from "@/lib/apiBase";

type RdAuthState = "checking" | "authed" | "anon" | "error";

function useRdAuth(): RdAuthState {
  const [state, setState] = useState<RdAuthState>("checking");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiPath("/admin/me"), {
          credentials: "include",
        });
        if (cancelled) return;
        setState(res.ok ? "authed" : "anon");
      } catch {
        // Network error — redirect to login rather than trust any local state.
        if (!cancelled) setState("anon");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export default function RdAuthLayout() {
  const location = useLocation();
  const state = useRdAuth();

  if (state === "checking") {
    return (
      <div className="px-4 py-12 text-center text-sm text-clinical-muted">
        Checking session…
      </div>
    );
  }
  if (state === "authed") return <Outlet />;
  return (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname)}`}
      replace
    />
  );
}

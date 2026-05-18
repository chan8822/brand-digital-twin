import { Navigate, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { apiPath } from "@/lib/apiBase";

type AdminAuthState = "checking" | "authed" | "anon";

function useAdminAuth(): AdminAuthState {
  const [state, setState] = useState<AdminAuthState>("checking");
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
        // Network error → redirect to login, never trust local state.
        if (!cancelled) setState("anon");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export default function AdminAuthLayout() {
  const location = useLocation();
  const state = useAdminAuth();
  if (state === "checking") {
    return (
      <div className="px-4 py-12 text-center text-sm text-clinical-muted">
        Checking admin session…
      </div>
    );
  }
  if (state !== "authed") {
    return (
      <Navigate
        to={`/admin/login?next=${encodeURIComponent(
          location.pathname + location.search,
        )}`}
        replace
      />
    );
  }
  return <Outlet />;
}

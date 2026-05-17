import { Navigate, Outlet, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { apiPath } from "@/lib/apiBase";

const ADMIN_KEY = "tanmatra:admin:v1";
const RD_KEY = "tanmatra:rd:v1";

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
        if (res.ok) {
          try {
            window.localStorage.setItem(ADMIN_KEY, "1");
          } catch {}
          setState("authed");
        } else {
          try {
            window.localStorage.removeItem(ADMIN_KEY);
          } catch {}
          setState("anon");
        }
      } catch {
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
  const adminState = useAdminAuth();
  if (typeof window === "undefined") return <Outlet />;
  
  const rdFlag = window.localStorage.getItem(RD_KEY);
  if (rdFlag === "1") return <Outlet />;
  
  if (adminState === "checking") {
    return (
      <div className="px-4 py-12 text-center text-sm text-clinical-muted">
        Checking session…
      </div>
    );
  }
  if (adminState === "authed") return <Outlet />;
  
  return (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname)}`}
      replace
    />
  );
}

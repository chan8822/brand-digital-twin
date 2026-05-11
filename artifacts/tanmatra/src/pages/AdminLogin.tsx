import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";

import { apiPath } from "@/lib/apiBase";

const ADMIN_KEY = "tanmatra:admin:v1";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get("next") ?? "/admin";
  // Only accept same-origin relative paths to avoid open-redirect.
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(apiPath("/admin/login"), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        const msg =
          data.error ||
          (res.status === 401
            ? "Invalid username or password"
            : res.status === 429
              ? "Too many attempts. Try again in a few minutes."
              : "Sign-in failed");
        setError(msg);
        toast.error(msg);
        return;
      }
      // Keep the legacy localStorage flag in sync so the existing
      // AdminGate UI hints (and any in-page checks that still read it)
      // continue to behave. Real authorization is the server cookie.
      try {
        window.localStorage.setItem(ADMIN_KEY, "1");
      } catch {
        /* ignore */
      }
      toast.success("Welcome back, admin");
      navigate(next, { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-clinical-muted">
            <ShieldCheck size={22} />
            <span className="text-sm uppercase tracking-wide">Admin</span>
          </div>
          <CardTitle>Sign in to the Tanmatra admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-username">Username</Label>
              <Input
                id="admin-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error ? (
              <div className="text-sm text-red-500" role="alert">
                {error}
              </div>
            ) : null}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-xs text-clinical-muted">
              Customers sign in with phone OTP from the regular login page.
              This screen is for the Tanmatra operations team.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

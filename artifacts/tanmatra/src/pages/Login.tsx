import { useNavigate, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FlaskConical, ShieldCheck, Activity } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") ?? "/";
  const loginUrl = `${import.meta.env.BASE_URL}api/login`;

  const enterAdminMode = () => {
    try {
      window.localStorage.setItem("tanmatra:admin:v1", "1");
      toast.success("Admin mode enabled (dev only)");
      navigate(next.startsWith("/") ? next : "/admin/ops", { replace: true });
    } catch {
      toast.error("Could not enable admin mode");
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm bg-clinical-surface border-clinical-slate/20">
        <CardHeader className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-clinical-gold/15 flex items-center justify-center border border-clinical-gold/25">
            <FlaskConical className="w-6 h-6 text-clinical-gold" />
          </div>
          <CardTitle className="text-white">Welcome to Tanmatra</CardTitle>
          <p className="text-xs text-clinical-zinc">
            Clinical-grade nutrition. Sign in to access your personalized plan.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            asChild
            className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold h-11 shadow-clinical"
            size="lg"
          >
            <a href={loginUrl}>Sign in with Replit</a>
          </Button>
          <p className="text-[10px] text-clinical-zinc flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-clinical-sage" />
            Secured by Replit Auth
          </p>

          <Separator className="bg-clinical-slate/20 my-2" />

          <Button
            variant="outline"
            onClick={enterAdminMode}
            className="w-full border-clinical-slate/30 text-clinical-zinc hover:text-clinical-gold hover:border-clinical-gold/40 gap-2 text-xs"
          >
            <Activity className="w-3.5 h-3.5" />
            Continue as Operations (dev)
          </Button>
          <p className="text-[10px] text-clinical-zinc text-center">
            Local dev shortcut for /admin/ops dashboards
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

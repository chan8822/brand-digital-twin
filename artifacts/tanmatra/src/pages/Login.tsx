import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlaskConical, ShieldCheck } from "lucide-react";

export default function Login() {
  const loginUrl = `${import.meta.env.BASE_URL}api/login`;
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
        </CardContent>
      </Card>
    </div>
  );
}

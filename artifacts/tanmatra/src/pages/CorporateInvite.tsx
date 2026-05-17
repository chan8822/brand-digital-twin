import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { corporateApi, type Company, type CompanyMember } from "@/lib/corporateApi";

export default function CorporateInvite() {
  const { token = "" } = useParams<{ token: string }>();
  const nav = useNavigate();
  const [invite, setInvite] = useState<{ invite: CompanyMember; company: Company } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    corporateApi
      .getInvite(token)
      .then((r) => setInvite(r))
      .catch(() => setError("Invite not found or expired"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const r = await corporateApi.acceptInvite(token);
      toast.success(`Joined ${r.company.name}`);
      nav(`/corporate/${r.company.slug}`);
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg.startsWith("401")) {
        nav(`/login?next=${encodeURIComponent(`/corporate/invite/${token}`)}`);
        return;
      }
      toast.error("Could not accept invite");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-clinical-zinc">Loading…</div>;
  if (error || !invite) {
    return (
      <div className="max-w-md mx-auto p-8 text-center space-y-3">
        <h1 className="text-xl font-bold text-white">Invite unavailable</h1>
        <p className="text-sm text-clinical-zinc">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-8 space-y-4 text-center">
      <Building2 className="w-10 h-10 mx-auto text-clinical-gold" />
      <h1 className="text-2xl font-bold text-white">{invite.company.name}</h1>
      <p className="text-sm text-clinical-zinc">
        You've been invited as a <strong>{invite.invite.role}</strong>. Accept to start using the
        company meal program.
      </p>
      <Card className="bg-clinical-surface border-clinical-border">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs text-clinical-zinc">Invitation for</p>
          <p className="text-sm text-white">{invite.invite.email}</p>
        </CardContent>
      </Card>
      <Button
        onClick={handleAccept}
        disabled={accepting}
        className="w-full bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90"
      >
        {accepting ? "Joining…" : "Accept invite"}
      </Button>
    </div>
  );
}

import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 space-y-4">
      <p className="text-clinical-label">404</p>
      <h1 className="text-clinical-h1 text-white">Page not found</h1>
      <p className="text-sm text-clinical-zinc max-w-sm">
        That page is off-protocol. Let&apos;s get you back to the menu.
      </p>
      <Link to="/">
        <Button className="bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 font-semibold gap-2">
          <Home className="w-4 h-4" />
          Back to Home
        </Button>
      </Link>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Sparkles, X } from "lucide-react";
import IntakeQuiz from "./IntakeQuiz";
import { usePreferences } from "@/lib/preferencesContext";

const DISMISS_KEY = "tanmatra:quiz-banner-dismissed:v1";

export default function OnboardingQuizGate() {
  const { needsQuiz } = usePreferences();
  const location = useLocation();
  const [bannerVisible, setBannerVisible] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);

  useEffect(() => {
    if (!needsQuiz) {
      setBannerVisible(false);
      return;
    }
    const onPreferences = location.pathname === "/preferences";
    const onLogin = location.pathname === "/login";
    if (onPreferences || onLogin) {
      setBannerVisible(false);
      return;
    }
    if (typeof window !== "undefined" && window.sessionStorage.getItem(DISMISS_KEY) === "1") {
      setBannerVisible(false);
      return;
    }
    setBannerVisible(true);
  }, [needsQuiz, location.pathname]);

  const dismissBanner = () => {
    setBannerVisible(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    }
  };

  const handleQuizChange = (open: boolean) => {
    setQuizOpen(open);
  };

  return (
    <>
      {bannerVisible && (
        <div className="fixed inset-x-0 bottom-16 md:bottom-4 z-30 px-3 md:px-4 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto bg-clinical-surface border border-clinical-gold/30 shadow-clinical-lg rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-clinical-gold/15 border border-clinical-gold/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-clinical-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white leading-tight">
                Personalize your menu
              </p>
              <p className="text-[11px] text-clinical-zinc leading-tight mt-0.5">
                60-second assessment — RD-matched dishes for your goal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuizOpen(true)}
              className="shrink-0 min-h-11 text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-md bg-clinical-gold text-[#050505] hover:bg-clinical-gold/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clinical-surface"
            >
              Start
            </button>
            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Dismiss assessment prompt"
              className="shrink-0 w-11 h-11 rounded-md text-clinical-zinc hover:text-white hover:bg-white/5 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-gold focus-visible:ring-offset-2 focus-visible:ring-offset-clinical-surface"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <IntakeQuiz open={quizOpen} onOpenChange={handleQuizChange} />
    </>
  );
}

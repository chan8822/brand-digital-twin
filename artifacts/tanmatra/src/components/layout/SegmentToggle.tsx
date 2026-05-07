import { Link, useLocation } from "react-router";
import { Dna, Zap, HeartPulse } from "lucide-react";

const SEGMENTS = [
  { id: "wellness", label: "Wellness", icon: HeartPulse, path: "/wellness", color: "text-clinical-sage", bg: "bg-clinical-sage/10", border: "border-clinical-sage/30" },
  { id: "performance", label: "Performance", icon: Zap, path: "/performance", color: "text-clinical-blue", bg: "bg-clinical-blue/10", border: "border-clinical-blue/30" },
  { id: "clinical", label: "Clinical", icon: Dna, path: "/clinical", color: "text-clinical-gold", bg: "bg-clinical-gold/10", border: "border-clinical-gold/30" },
];

export default function SegmentToggle() {
  const location = useLocation();

  return (
    <div className="sticky top-14 z-40 bg-[#050505]/90 backdrop-blur-xl border-b border-clinical-slate/30">
      <div className="max-w-7xl mx-auto px-4 py-2.5">
        <div className="flex items-center gap-2 justify-center">
          <span className="text-clinical-label mr-2 hidden sm:inline">Protocol</span>
          {SEGMENTS.map((seg) => {
            const isActive = location.pathname === seg.path;
            return (
              <Link
                key={seg.id}
                to={seg.path}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 border ${
                  isActive
                    ? `${seg.bg} ${seg.color} ${seg.border} shadow-clinical`
                    : "bg-transparent text-clinical-zinc border-transparent hover:bg-white/5 hover:text-white"
                }`}
              >
                <seg.icon className="w-3.5 h-3.5" />
                {seg.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

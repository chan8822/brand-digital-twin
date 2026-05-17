import { Link } from "react-router";
import { FlaskConical, Mail, Phone, MapPin, ShieldCheck, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const FOOTER_LINKS = {
  platform: [
    { label: "Home", href: "/" },
    { label: "Clinical Menu", href: "/menu" },
    { label: "Track Order", href: "/track" },
    { label: "Cart & Checkout", href: "/cart" },
  ],
  protocols: [
    { label: "Wellness Protocol", href: "/wellness" },
    { label: "Performance Protocol", href: "/performance" },
    { label: "Clinical Protocol", href: "/clinical" },
  ],
  clinical: [
    { label: "Health Assessment", href: "/preferences" },
    { label: "Book a Dietitian", href: "/rd" },
    { label: "Therapeutic Plans", href: "/plans" },
    { label: "Recipes", href: "/recipes" },
    { label: "Cohort Challenges", href: "/challenges" },
    { label: "For Dietitians", href: "/rd-partners" },
  ],
};

export default function Footer() {
  return (
    <footer className="hidden md:block border-t border-clinical-slate/20 bg-clinical-surface">
      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand column */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-clinical-gold/15 flex items-center justify-center border border-clinical-gold/25">
                <FlaskConical className="w-4 h-4 text-clinical-gold" />
              </div>
              <div>
                <span className="text-sm font-semibold text-white">Tanmatra</span>
                <span className="text-[9px] text-clinical-zinc tracking-widest uppercase block">Clinical Nutrition</span>
              </div>
            </div>
            <p className="text-xs text-white leading-relaxed max-w-xs">
              Precision nutrition engineered by science. Every meal is clinically formulated,
              macro-calibrated, and RD-verified for your metabolic profile.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="flex items-center gap-1.5 text-white">
                <Mail className="w-3 h-3 text-clinical-gold" />
                <span className="text-xs">care@tanmatra.health</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-white">
              <Phone className="w-3 h-3 text-clinical-gold" />
              <span className="text-xs">+91 80 4701 9200</span>
            </div>
            <div className="flex items-center gap-1.5 text-white">
              <MapPin className="w-3 h-3 text-clinical-gold" />
              <span className="text-xs">Bengaluru, Karnataka, India</span>
            </div>
          </div>

          {/* Links */}
          <div className="space-y-3">
            <p className="text-clinical-label text-white">Platform</p>
            <div className="space-y-2">
              {FOOTER_LINKS.platform.map((link) => (
                <Link key={link.href} to={link.href} className="block text-xs text-white hover:text-clinical-gold transition-colors">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-clinical-label text-white">Protocols</p>
            <div className="space-y-2">
              {FOOTER_LINKS.protocols.map((link) => (
                <Link key={link.href} to={link.href} className="block text-xs text-white hover:text-clinical-gold transition-colors">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-clinical-label text-white">Clinical</p>
            <div className="space-y-2">
              {FOOTER_LINKS.clinical.map((link) => (
                <Link key={link.href} to={link.href} className="block text-xs text-white hover:text-clinical-gold transition-colors">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Separator className="bg-clinical-slate/20" />

      {/* Bottom bar */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-clinical-sage" />
            <span className="text-[10px] text-white">ISO 22000 Certified Kitchens &middot; FSSAI Lic. No.: TODO(founder): supply FSSAI licence number.</span>
          </div>
          <p className="text-[10px] text-white">
            © 2024 Tanmatra Health Technologies Pvt. Ltd.
          </p>
        </div>
      </div>

      {/* Medical Disclaimer */}
      <div className="border-t border-clinical-slate/20 bg-clinical-dark">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <p className="text-[10px] text-white text-center leading-relaxed">
            <strong className="text-clinical-gold">Medical Disclaimer:</strong> Tanmatra meals are designed as adjuncts to medical treatment
            and should not replace prescribed therapies. Always consult your physician or registered dietitian
            before beginning any therapeutic nutrition program. Individual results may vary.
          </p>
        </div>
      </div>
    </footer>
  );
}

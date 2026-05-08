import { Link, useLocation } from "react-router";
import { useState } from "react";
import {
  Home,
  Utensils,
  ShoppingCart,
  Package,
  Menu as MenuIcon,
  CalendarClock,
  BookOpen,
  Flag,
  Stethoscope,
  HeartHandshake,
  Sparkles,
  SlidersHorizontal,
  Users,
  Building2,
  Gift,
  Crown,
  ShoppingBag,
  MapPin,
  ShieldCheck,
  Mail,
  Phone,
  LogIn,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/cartContext";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  match?: (pathname: string) => boolean;
}

const PRIMARY: NavItem[] = [
  { to: "/", label: "Home", icon: Home, match: (p) => p === "/" },
  { to: "/menu", label: "Menu", icon: Utensils, match: (p) => p.startsWith("/menu") || p.startsWith("/dish") },
  { to: "/cart", label: "Cart", icon: ShoppingCart, match: (p) => p === "/cart" || p === "/checkout" },
  { to: "/orders", label: "Orders", icon: Package, match: (p) => p.startsWith("/orders") || p === "/track" },
];

interface MoreLink {
  to: string;
  label: string;
  icon: typeof Home;
  desc?: string;
}

const MORE_GROUPS: { title: string; items: MoreLink[] }[] = [
  {
    title: "Plans & Programs",
    items: [
      { to: "/subscriptions", label: "My Plans", icon: CalendarClock, desc: "Weekly meal plans & active subscriptions" },
      { to: "/meal-planner", label: "Weekly Planner", icon: Sparkles, desc: "AI-personalized 7-day plan" },
      { to: "/plans", label: "RD Plans", icon: Stethoscope, desc: "Therapeutic protocols" },
      { to: "/rd", label: "Book a Dietitian", icon: HeartHandshake, desc: "1:1 consult" },
      { to: "/appointments", label: "My Care", icon: CalendarClock, desc: "Appointments & notes" },
    ],
  },
  {
    title: "Discover",
    items: [
      { to: "/recipes", label: "Recipes", icon: BookOpen },
      { to: "/challenges", label: "Challenges", icon: Flag },
      { to: "/wellness", label: "Wellness Protocol", icon: HeartHandshake },
      { to: "/performance", label: "Performance Protocol", icon: Sparkles },
      { to: "/clinical", label: "Clinical Protocol", icon: Stethoscope },
    ],
  },
  {
    title: "For You",
    items: [
      { to: "/rewards", label: "Rewards", icon: Sparkles },
      { to: "/vouchers", label: "Vouchers", icon: Gift },
      { to: "/premium", label: "Premium", icon: Crown, desc: "Priority delivery + free RD consult" },
      { to: "/marketplace", label: "Marketplace", icon: ShoppingBag, desc: "RD-curated pantry & supplements" },
      { to: "/track", label: "Track Order", icon: MapPin },
      { to: "/preferences", label: "Preferences", icon: SlidersHorizontal },
    ],
  },
  {
    title: "Work & Teams",
    items: [
      { to: "/corporate", label: "Corporate", icon: Building2 },
      { to: "/team", label: "Team", icon: Users },
      { to: "/rd-partners", label: "For Dietitians", icon: Stethoscope, desc: "Become an RD partner" },
    ],
  },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  const { totalQuantity } = useCart();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-clinical-slate/30 bg-[#050505]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {PRIMARY.map((item) => {
            const active = item.match
              ? item.match(pathname)
              : pathname === item.to;
            const showBadge = item.to === "/cart" && totalQuantity > 0;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 text-[10px] font-medium tracking-wide transition-colors ${
                    active
                      ? "text-clinical-gold"
                      : "text-clinical-zinc hover:text-white"
                  }`}
                >
                  <item.icon
                    className="w-5 h-5"
                    strokeWidth={active ? 2.4 : 1.8}
                    aria-hidden
                  />
                  <span>{item.label}</span>
                  {showBadge && (
                    <Badge
                      className="absolute top-1 right-[22%] h-4 min-w-4 px-1 text-[9px] bg-clinical-gold text-[#050505] border-0 font-bold leading-none"
                      aria-label={`${totalQuantity} items in cart`}
                    >
                      {totalQuantity}
                    </Badge>
                  )}
                  {active && (
                    <span className="absolute top-0 inset-x-6 h-0.5 rounded-b bg-clinical-gold" />
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="w-full flex flex-col items-center justify-center gap-0.5 min-h-[56px] py-1.5 text-[10px] font-medium tracking-wide text-clinical-zinc hover:text-white transition-colors"
            >
              <MenuIcon className="w-5 h-5" strokeWidth={1.8} aria-hidden />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="right"
          className="w-[88vw] max-w-sm bg-clinical-surface border-clinical-slate/30 p-0 flex flex-col"
        >
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-clinical-slate/20">
            <SheetTitle className="text-white text-base font-serif flex items-center justify-between">
              Explore Tanmatra
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="text-clinical-zinc hover:text-white -mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            <Link
              to="/login"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg border border-clinical-gold/30 bg-clinical-gold/10 px-4 py-3 min-h-[52px] active:bg-clinical-gold/15"
            >
              <LogIn className="w-4 h-4 text-clinical-gold" />
              <div className="flex-1">
                <p className="text-sm text-white font-medium">Sign in</p>
                <p className="text-[11px] text-clinical-zinc">
                  Save preferences, track orders, earn rewards
                </p>
              </div>
            </Link>

            {MORE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-[10px] uppercase tracking-widest text-clinical-zinc/70 mb-2 px-1">
                  {group.title}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-3 px-3 py-3 min-h-[48px] rounded-md text-white hover:bg-white/5 active:bg-white/10 transition-colors"
                      >
                        <item.icon className="w-4 h-4 text-clinical-gold shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm leading-tight">{item.label}</p>
                          {item.desc && (
                            <p className="text-[11px] text-clinical-zinc leading-tight mt-0.5">
                              {item.desc}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="pt-4 mt-2 border-t border-clinical-slate/20 space-y-2 text-[11px] text-clinical-zinc">
              <div className="flex items-center gap-2">
                <Mail className="w-3 h-3 text-clinical-gold" />
                care@tanmatra.health
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3 h-3 text-clinical-gold" />
                +91 80 4701 9200
              </div>
              <div className="flex items-center gap-2 pt-1">
                <ShieldCheck className="w-3 h-3 text-clinical-sage" />
                ISO 22000 · FSSAI Licensed
              </div>
              <p className="pt-2 text-[10px] text-clinical-zinc/70">
                © {new Date().getFullYear()} Tanmatra Health Technologies
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

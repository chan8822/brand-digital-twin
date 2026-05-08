import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Home,
  Utensils,
  MapPin,
  Package,
  ShoppingCart,
  CalendarClock,
  Sparkles,
  SlidersHorizontal,
  Users,
  Stethoscope,
  HeartHandshake,
  BookOpen,
  Flag,
  Building2,
  Gift,
  User,
} from "lucide-react";
import { useCart } from "@/lib/cartContext";
import Logo from "./Logo";

export default function Header() {
  const location = useLocation();
  const { totalQuantity } = useCart();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/menu", label: "Menu", icon: Utensils },
    { path: "/recipes", label: "Recipes", icon: BookOpen },
    { path: "/challenges", label: "Challenges", icon: Flag },
    { path: "/plans", label: "RD Plans", icon: Stethoscope },
    { path: "/rd", label: "Book RD", icon: HeartHandshake },
    { path: "/appointments", label: "Care", icon: CalendarClock },
    { path: "/orders", label: "Orders", icon: Package },
    { path: "/subscriptions", label: "My Plans", icon: CalendarClock },
    { path: "/rewards", label: "Rewards", icon: Sparkles },
    { path: "/preferences", label: "Preferences", icon: SlidersHorizontal },
    { path: "/team", label: "Team", icon: Users },
    { path: "/corporate", label: "Corporate", icon: Building2 },
    { path: "/vouchers", label: "Vouchers", icon: Gift },
    { path: "/track", label: "Track", icon: MapPin },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-clinical-slate/30 bg-[#050505]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center shrink-0" aria-label="Tanmatra home">
          <Logo className="h-7 w-auto text-clinical-gold" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  active
                    ? "bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30"
                    : "text-clinical-zinc hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className={`w-3.5 h-3.5 ${active ? "text-clinical-gold" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/cart"
            aria-label={`Cart${totalQuantity > 0 ? ` (${totalQuantity} items)` : ""}`}
            className="relative inline-flex items-center justify-center h-10 w-10 sm:h-8 sm:w-auto sm:px-3 rounded-md text-clinical-zinc hover:text-clinical-gold hover:bg-clinical-gold/10 transition-colors"
          >
            <ShoppingCart className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline ml-1.5 text-xs">Cart</span>
            {totalQuantity > 0 && (
              <Badge className="absolute top-1 right-1 sm:static sm:ml-1 h-4 min-w-4 px-1 text-[10px] bg-clinical-gold text-[#050505] border-0 font-bold leading-none">
                {totalQuantity}
              </Badge>
            )}
          </Link>

          <Link
            to="/login"
            aria-label="My account"
            className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-md text-clinical-zinc hover:text-clinical-gold hover:bg-clinical-gold/10 transition-colors"
          >
            <User className="w-5 h-5" />
          </Link>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-clinical-sage/10 border border-clinical-sage/20">
            <span className="w-1.5 h-1.5 rounded-full bg-clinical-sage animate-pulse" />
            <span className="text-[10px] text-clinical-sage font-medium tracking-wide">RD VERIFIED</span>
          </div>
        </div>
      </div>
    </header>
  );
}

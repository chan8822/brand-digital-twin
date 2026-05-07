import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList,
  Home,
  Utensils,
  MapPin,
  Package,
  Menu as MenuIcon,
  X,
} from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cartContext";
import Logo from "./Logo";

export default function Header() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { totalQuantity } = useCart();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { path: "/", label: "Home", icon: Home },
    { path: "/menu", label: "Menu", icon: Utensils },
    { path: "/orders", label: "Orders", icon: Package },
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

        <div className="flex items-center gap-2">
          <Link to="/cart" className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-clinical-zinc hover:text-clinical-gold hover:bg-clinical-gold/10"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="hidden sm:inline">Plan</span>
              {totalQuantity > 0 && (
                <Badge className="h-4 min-w-4 px-1 text-[10px] bg-clinical-gold text-[#050505] border-0 ml-0.5 font-bold">
                  {totalQuantity}
                </Badge>
              )}
            </Button>
          </Link>

          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-clinical-sage/10 border border-clinical-sage/20">
            <span className="w-1.5 h-1.5 rounded-full bg-clinical-sage animate-pulse" />
            <span className="text-[10px] text-clinical-sage font-medium tracking-wide">RD VERIFIED</span>
          </div>

          <Button
            size="icon"
            variant="ghost"
            className="md:hidden h-8 w-8 text-clinical-zinc"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <MenuIcon className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-clinical-slate/30 px-4 py-3 bg-[#050505]/95 backdrop-blur-xl flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/20"
                    : "text-clinical-zinc hover:text-white hover:bg-white/5"
                }`}
              >
                <item.icon className={`w-4 h-4 ${active ? "text-clinical-gold" : ""}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

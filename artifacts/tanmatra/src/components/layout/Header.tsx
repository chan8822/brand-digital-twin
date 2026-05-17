import { Link, useLocation } from "react-router";
import { Badge } from "@/components/ui/badge";
import {
  ForkKnife,
  Calendar,
  Package,
  UsersThree,
  UserCircle,
  ShoppingCart,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useCart, useCartDrawer } from "@/lib/cartContext";
import Logo from "./Logo";
import CommandPalette, { useCommandPaletteHotkey } from "@/components/CommandPalette";
import { MoreSheetTrigger } from "@/components/layout/BottomNav";

export default function Header() {
  const location = useLocation();
  const { totalQuantity } = useCart();
  const { open: openCart } = useCartDrawer();
  const palette = useCommandPaletteHotkey();

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname === path || location.pathname.startsWith(path + "/");

  // Customer nav grouping: Eat / Plan / Track / Community / Account
  const navItems = [
    { path: "/menu", label: "Eat", icon: ForkKnife, match: ["/menu", "/dish", "/marketplace", "/recipes"] },
    { path: "/meal-planner", label: "Plan", icon: Calendar, match: ["/meal-planner", "/subscriptions", "/plans", "/rd", "/appointments", "/subscribe"] },
    { path: "/orders", label: "Orders", icon: Package, match: ["/orders", "/track"] },
    { path: "/challenges", label: "Community", icon: UsersThree, match: ["/challenges", "/wellness", "/performance", "/clinical", "/corporate", "/team"] },
    { path: "/account", label: "Account", icon: UserCircle, match: ["/account", "/preferences", "/rewards", "/vouchers", "/premium", "/login"] },
  ];

  const isGroupActive = (matchPaths: string[]) =>
    matchPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-clinical-border bg-[#050505]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="Tanmatra">
            <Logo className="h-7 w-auto text-clinical-gold" aria-hidden="true" />
            <span className="md:hidden font-serif text-base text-white tracking-tight leading-none">
              Tanmatra
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {navItems.map((item) => {
              const onExactPath = isActive(item.path);
              const active = isGroupActive(item.match) || onExactPath;
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    active
                      ? "bg-clinical-gold/15 text-clinical-gold border border-clinical-gold/30"
                      : "text-clinical-zinc hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                  aria-current={onExactPath ? "page" : undefined}
                >
                  <Icon className="w-3.5 h-3.5" weight={active ? "fill" : "regular"} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* ⌘K command palette trigger */}
            <button
              type="button"
              onClick={() => palette.setOpen(true)}
              aria-label="Open command palette"
              className="hidden md:inline-flex items-center gap-2 h-8 pl-2 pr-1.5 rounded-md border border-clinical-border bg-white/5 text-[11px] text-clinical-zinc hover:text-white hover:border-clinical-gold/40 transition-colors"
            >
              <MagnifyingGlass className="w-3.5 h-3.5" aria-hidden />
              <span>Search</span>
              <kbd className="ml-1 inline-flex items-center gap-0.5 rounded bg-clinical-surface-elevated px-1.5 py-0.5 font-mono text-[10px] text-clinical-zinc">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => palette.setOpen(true)}
              aria-label="Open command palette"
              className="md:hidden inline-flex items-center justify-center h-10 w-10 rounded-md text-clinical-zinc hover:text-clinical-gold hover:bg-clinical-gold/10 transition-colors"
            >
              <MagnifyingGlass className="w-5 h-5" aria-hidden />
            </button>

            <button
              type="button"
              onClick={openCart}
              aria-label={`Open cart${totalQuantity > 0 ? ` (${totalQuantity} items)` : ""}`}
              className="relative inline-flex items-center justify-center h-10 w-10 sm:h-8 sm:w-auto sm:px-3 rounded-md text-clinical-zinc hover:text-clinical-gold hover:bg-clinical-gold/10 transition-colors"
            >
              <ShoppingCart className="w-5 h-5 sm:w-4 sm:h-4" aria-hidden />
              <span className="hidden sm:inline ml-1.5 text-xs">Cart</span>
              {totalQuantity > 0 && (
                <Badge className="absolute top-1 right-1 sm:static sm:ml-1 h-4 min-w-4 px-1 text-[10px] bg-clinical-gold text-[#050505] border-0 font-bold leading-none">
                  {totalQuantity}
                </Badge>
              )}
            </button>

            {/* Mobile-only "more" hamburger to open the full Explore sheet.
                Account is reachable from the bottom nav, so we drop the
                redundant /login icon to reduce header crowding on mobile. */}
            <span className="md:hidden">
              <MoreSheetTrigger />
            </span>
          </div>
        </div>
      </header>

      <CommandPalette open={palette.open} setOpen={palette.setOpen} />
    </>
  );
}

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  House,
  ForkKnife,
  ShoppingCart,
  Package,
  Calendar,
  Sparkle,
  Stethoscope,
  HandHeart,
  Flag,
  BookOpen,
  Crown,
  Storefront,
  MapPin,
  SlidersHorizontal,
  Buildings,
  Users,
  Gift,
  Notepad,
  SignIn,
  PaintBrush,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import { useMenuCatalog } from "@/lib/menuData";

interface CommandPaletteContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

type RouteGroup = "Eat" | "Plan" | "Track" | "Community" | "Account";

interface RouteEntry {
  label: string;
  to: string;
  icon: Icon;
  group: RouteGroup;
  keywords?: string;
  devOnly?: boolean;
}

const NAV_ROUTES: RouteEntry[] = [
  { label: "Home", to: "/", icon: House, group: "Eat", keywords: "landing start" },
  { label: "Browse menu", to: "/menu", icon: ForkKnife, group: "Eat", keywords: "dishes meals catalog" },
  { label: "Marketplace", to: "/marketplace", icon: Storefront, group: "Eat", keywords: "pantry supplements" },
  { label: "Recipes", to: "/recipes", icon: BookOpen, group: "Eat" },
  { label: "Cart", to: "/cart", icon: ShoppingCart, group: "Eat" },
  { label: "Checkout", to: "/checkout", icon: ShoppingCart, group: "Eat" },

  { label: "Weekly meal planner", to: "/meal-planner", icon: Sparkle, group: "Plan", keywords: "ai 7 day" },
  { label: "My subscriptions", to: "/subscriptions", icon: Calendar, group: "Plan" },
  { label: "Therapeutic plans", to: "/plans", icon: Stethoscope, group: "Plan", keywords: "rd protocols" },
  { label: "Book a dietitian", to: "/rd", icon: HandHeart, group: "Plan", keywords: "consult appointment" },
  { label: "My care", to: "/appointments", icon: Calendar, group: "Plan", keywords: "appointments visits" },
  { label: "Checkout appointment", to: "/checkout-appointment", icon: Calendar, group: "Plan", keywords: "rd consult booking pay" },
  { label: "Subscribe to a plan", to: "/subscribe", icon: Notepad, group: "Plan" },
  { label: "Become an RD partner", to: "/rd-partners", icon: Stethoscope, group: "Plan", keywords: "dietitian apply join" },
  { label: "Apply to be an RD partner", to: "/rd-partners/apply", icon: Notepad, group: "Plan", keywords: "wizard rd onboarding application" },

  { label: "Track current order", to: "/track", icon: MapPin, group: "Track" },
  { label: "Order history", to: "/orders", icon: Package, group: "Track" },

  { label: "Cohort challenges", to: "/challenges", icon: Flag, group: "Community" },
  { label: "Wellness protocol", to: "/wellness", icon: HandHeart, group: "Community" },
  { label: "Performance protocol", to: "/performance", icon: Sparkle, group: "Community" },
  { label: "Clinical protocol", to: "/clinical", icon: Stethoscope, group: "Community" },
  { label: "Corporate", to: "/corporate", icon: Buildings, group: "Community", keywords: "office team" },
  { label: "Team", to: "/team", icon: Users, group: "Community" },

  { label: "Account hub", to: "/account", icon: UserCircle, group: "Account", keywords: "profile sign out logout" },
  { label: "Address book", to: "/account/addresses", icon: MapPin, group: "Account", keywords: "saved addresses delivery home office" },
  { label: "Sign in", to: "/login", icon: SignIn, group: "Account" },
  { label: "Preferences & health profile", to: "/preferences", icon: SlidersHorizontal, group: "Account", keywords: "diet allergies targets" },
  { label: "Rewards", to: "/rewards", icon: Sparkle, group: "Account" },
  { label: "Vouchers", to: "/vouchers", icon: Gift, group: "Account" },
  { label: "Premium", to: "/premium", icon: Crown, group: "Account" },
  { label: "Design styleguide", to: "/__styleguide", icon: PaintBrush, group: "Account", keywords: "tokens components dev internal", devOnly: true },
];

export function useCommandPaletteHotkey(): CommandPaletteContextValue {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return { open, setOpen };
}

export default function CommandPalette({
  open,
  setOpen,
}: CommandPaletteContextValue) {
  const navigate = useNavigate();
  const { dishes } = useMenuCatalog();
  const isDev = import.meta.env.DEV;

  const dishItems = useMemo(
    () =>
      (dishes ?? [])
        .slice(0, 60)
        .map((d) => ({ slug: d.slug, name: d.name, kitchen: d.kitchen })),
    [dishes],
  );

  const groupedRoutes = useMemo(() => {
    const groups: Record<string, RouteEntry[]> = {};
    for (const r of NAV_ROUTES) {
      if (r.devOnly && !isDev) continue;
      groups[r.group] = groups[r.group] ?? [];
      groups[r.group].push(r);
    }
    return groups;
  }, [isDev]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search dishes, pages, or actions…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {dishItems.length > 0 && (
          <>
            <CommandGroup heading="Dishes">
              {dishItems.map((d) => (
                <CommandItem
                  key={d.slug}
                  value={`${d.name} ${d.kitchen} dish`}
                  onSelect={() => go(`/dish/${d.slug}`)}
                >
                  <ForkKnife />
                  <span>{d.name}</span>
                  <CommandShortcut className="capitalize">{d.kitchen}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {Object.entries(groupedRoutes).map(([groupName, items], idx, arr) => (
          <div key={groupName}>
            <CommandGroup heading={groupName}>
              {items.map((r) => {
                const RouteIcon = r.icon;
                return (
                  <CommandItem
                    key={r.to}
                    value={`${r.label} ${r.keywords ?? ""}`}
                    onSelect={() => go(r.to)}
                  >
                    <RouteIcon />
                    <span>{r.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {idx < arr.length - 1 && <CommandSeparator />}
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

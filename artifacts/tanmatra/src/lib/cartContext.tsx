import type { ReactNode } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CartItem {
  lineId: string;
  dishId: number;
  slug: string;
  name: string;
  image: string;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  kitchen: string;
  isVeg: boolean;
  rdVerified: boolean;
  macros: { protein: number; carbs: number; fat: number; fiber: number; calories: number };
  customizations: string[];
}

interface CartState {
  items: CartItem[];
  // Slugs of combo bundles the user accepted in the menu. The server
  // re-validates each slug at finalize time and applies the bundle
  // discount only if every component dish is present in the order.
  bundleSlugs: string[];
  addItem: (item: Omit<CartItem, "lineId">) => void;
  updateQty: (lineId: string, delta: number) => void;
  removeItem: (lineId: string) => void;
  addBundleSlug: (slug: string) => void;
  clear: () => void;
}

const STORAGE_KEY = "tanmatra:cart:v1";

const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      bundleSlugs: [],
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find(
            (p) =>
              p.dishId === item.dishId &&
              JSON.stringify(p.customizations) === JSON.stringify(item.customizations) &&
              p.unitPrice === item.unitPrice,
          );
          if (existing) {
            return {
              items: state.items.map((p) =>
                p.lineId === existing.lineId ? { ...p, quantity: p.quantity + item.quantity } : p,
              ),
            };
          }
          const lineId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return { items: [...state.items, { ...item, lineId }] };
        }),
      updateQty: (lineId, delta) =>
        set((state) => {
          const nextItems = state.items
            .map((p) =>
              p.lineId === lineId
                ? { ...p, quantity: Math.max(0, p.quantity + delta) }
                : p,
            )
            .filter((p) => p.quantity > 0);
          // If a line was fully removed, drop active combo intents — the
          // user has clearly diverged from the original bundle composition.
          const lostLine = nextItems.length < state.items.length;
          return {
            items: nextItems,
            bundleSlugs: lostLine ? [] : state.bundleSlugs,
          };
        }),
      removeItem: (lineId) =>
        set((state) => ({
          items: state.items.filter((p) => p.lineId !== lineId),
          bundleSlugs: [],
        })),
      // Append (don't dedupe) so two purchases of the same combo apply
      // two server-side discounts. The server caps each instance to
      // available cart stock, so spurious extras are no-ops.
      addBundleSlug: (slug) =>
        set((state) => ({ bundleSlugs: [...state.bundleSlugs, slug] })),
      clear: () => set({ items: [], bundleSlugs: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// Backwards-compatible provider wrapper (Zustand needs no provider, but keeps App.tsx unchanged).
export function CartProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useCart() {
  const items = useCartStore((s) => s.items);
  const bundleSlugs = useCartStore((s) => s.bundleSlugs);
  const addItem = useCartStore((s) => s.addItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const addBundleSlug = useCartStore((s) => s.addBundleSlug);
  const clear = useCartStore((s) => s.clear);
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const totalQuantity = items.reduce((t, it) => t + it.quantity, 0);
  return {
    items,
    bundleSlugs,
    addItem,
    updateQty,
    removeItem,
    addBundleSlug,
    clear,
    subtotal,
    totalQuantity,
  };
}

export const FREE_DELIVERY_THRESHOLD = 50000;
export const DELIVERY_FEE = 5000;

import type { ReactNode } from "react";
import { useMemo } from "react";
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

export type AddStatus = "idle" | "loading" | "success";

interface CartState {
  items: CartItem[];
  // Slugs of combo bundles the user accepted in the menu. The server
  // re-validates each slug at finalize time and applies the bundle
  // discount only if every component dish is present in the order.
  bundleSlugs: string[];
  isDrawerOpen: boolean;
  // Per-dish ephemeral add-to-cart UI state. Not persisted; reset on reload.
  addStatus: Record<number, AddStatus>;
  addItem: (item: Omit<CartItem, "lineId">) => void;
  updateQty: (lineId: string, delta: number) => void;
  setQty: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  addBundleSlug: (slug: string) => void;
  clear: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setAddStatus: (dishId: number, status: AddStatus) => void;
}

const STORAGE_KEY = "tanmatra:cart:v1";

const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      bundleSlugs: [],
      isDrawerOpen: false,
      addStatus: {},
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
      setQty: (lineId, quantity) =>
        set((state) => {
          const clamped = Math.max(0, Math.floor(quantity));
          const nextItems = state.items
            .map((p) => (p.lineId === lineId ? { ...p, quantity: clamped } : p))
            .filter((p) => p.quantity > 0);
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
      clear: () => set({ items: [], bundleSlugs: [], addStatus: {} }),
      openDrawer: () => set({ isDrawerOpen: true }),
      closeDrawer: () => set({ isDrawerOpen: false }),
      toggleDrawer: () => set((s) => ({ isDrawerOpen: !s.isDrawerOpen })),
      setAddStatus: (dishId, status) =>
        set((state) => ({ addStatus: { ...state.addStatus, [dishId]: status } })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Don't persist ephemeral UI state.
      partialize: (state) => ({ items: state.items, bundleSlugs: state.bundleSlugs }),
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
  const setQty = useCartStore((s) => s.setQty);
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
    setQty,
    removeItem,
    addBundleSlug,
    clear,
    subtotal,
    totalQuantity,
  };
}

// GST on restaurant food in India = 5%. Stored as basis points to keep math integer-safe.
export const GST_BPS = 500; // 5.00%
export const FREE_DELIVERY_THRESHOLD = 50000; // ₹500 in paise
export const DELIVERY_FEE = 5000; // ₹50 in paise

/**
 * Memoised totals derived from cart items. All values are in paise.
 * Single source of truth for subtotal/tax/delivery/total — every consumer
 * (drawer, cart page, sticky bar, checkout) reads from here so the math
 * stays consistent across the app.
 */
export function useCartTotals() {
  const items = useCartStore((s) => s.items);
  return useMemo(() => {
    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    const totalQuantity = items.reduce((t, it) => t + it.quantity, 0);
    const deliveryFee = subtotal === 0 || subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    const tax = Math.round((subtotal * GST_BPS) / 10000);
    const total = subtotal + tax + deliveryFee;
    const amountToFreeDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);
    const freeDeliveryProgress = subtotal === 0
      ? 0
      : Math.min(100, (subtotal / FREE_DELIVERY_THRESHOLD) * 100);
    return {
      subtotal,
      tax,
      deliveryFee,
      total,
      totalQuantity,
      amountToFreeDelivery,
      freeDeliveryProgress,
      hasFreeDelivery: deliveryFee === 0 && subtotal > 0,
    };
  }, [items]);
}

export function useCartDrawer() {
  const isOpen = useCartStore((s) => s.isDrawerOpen);
  const open = useCartStore((s) => s.openDrawer);
  const close = useCartStore((s) => s.closeDrawer);
  const toggle = useCartStore((s) => s.toggleDrawer);
  return { isOpen, open, close, toggle };
}

export function useAddToCartStatus(dishId: number): {
  status: AddStatus;
  setStatus: (s: AddStatus) => void;
} {
  const status = useCartStore((s) => s.addStatus[dishId] ?? "idle");
  const set = useCartStore((s) => s.setAddStatus);
  return { status, setStatus: (s) => set(dishId, s) };
}

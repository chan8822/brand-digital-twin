import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

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

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "lineId">) => void;
  updateQty: (lineId: string, delta: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  subtotal: number;
  totalQuantity: number;
}

const STORAGE_KEY = "tanmatra:cart:v1";

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CartItem[];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => loadCart());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const customKey = (cs: string[]) => JSON.stringify([...cs].sort());

  const addItem: CartContextValue["addItem"] = (item) => {
    setItems((prev) => {
      const incomingKey = customKey(item.customizations);
      const existing = prev.find(
        (p) =>
          p.dishId === item.dishId &&
          customKey(p.customizations) === incomingKey &&
          p.unitPrice === item.unitPrice,
      );
      if (existing) {
        return prev.map((p) =>
          p.lineId === existing.lineId ? { ...p, quantity: p.quantity + item.quantity } : p,
        );
      }
      const lineId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return [...prev, { ...item, lineId }];
    });
  };

  const updateQty: CartContextValue["updateQty"] = (lineId, delta) => {
    setItems((prev) =>
      prev
        .map((p) => (p.lineId === lineId ? { ...p, quantity: Math.max(0, p.quantity + delta) } : p))
        .filter((p) => p.quantity > 0),
    );
  };

  const removeItem: CartContextValue["removeItem"] = (lineId) => {
    setItems((prev) => prev.filter((p) => p.lineId !== lineId));
  };

  const clear = () => setItems([]);

  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const totalQuantity = items.reduce((t, it) => t + it.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQty, removeItem, clear, subtotal, totalQuantity }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export const FREE_DELIVERY_THRESHOLD = 50000;
export const DELIVERY_FEE = 5000;

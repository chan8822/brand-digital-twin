import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Indian-grouped formatting (1,00,000 not 100,000); drops trailing
// `.00` for whole rupees. Mirrors lib/api/adapter.ts:formatPrice.
const INR_CURRENCY = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
export function formatCurrency(paise: number): string {
  return `₹${INR_CURRENCY.format(paise / 100)}`;
}

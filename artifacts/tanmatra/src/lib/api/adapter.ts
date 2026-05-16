// Indian formatting: rupee glyph (₹) + Indian-grouping (1,00,000 not
// 100,000). Drops the trailing `.00` for whole-rupee values to match
// every other Indian D2C app the customer is comparing against.
const INR = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
export function formatPrice(paise: number): string {
  const rupees = paise / 100;
  return `₹${INR.format(rupees)}`;
}

export interface MenuComboWithAvailability {
  id: number;
  name: string;
  category: string;
  kitchen: string;
  price: number;
  isAvailable: boolean;
  ingredients: string[];
  imageUrl: string | null;
  rdVerified: boolean;
}

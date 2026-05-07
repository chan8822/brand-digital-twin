export function formatPrice(paise: number): string {
  return `Rs.${(paise / 100).toFixed(2)}`;
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

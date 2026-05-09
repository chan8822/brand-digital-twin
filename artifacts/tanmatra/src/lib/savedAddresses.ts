export interface SavedAddress {
  id: string;
  label: string;
  type: "home" | "work";
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  phone: string;
}

// Saved addresses are now sourced exclusively from the API/database.
// No hardcoded sample addresses ship with the build.
export const SAVED_ADDRESSES: SavedAddress[] = [];

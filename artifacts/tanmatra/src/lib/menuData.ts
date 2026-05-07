export interface DishCustomOption {
  name: string;
  priceModifier: number;
  default?: boolean;
}

export interface DishCustomGroup {
  groupName: string;
  type: "single" | "multiple";
  options: DishCustomOption[];
}

export interface DishMacros {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  calories: number;
}

export type DishCategory = "wellness" | "performance" | "clinical" | "desserts";
export type DishKitchen = "continental" | "chinese";

export interface DishData {
  id: number;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  image: string;
  price: number;
  kitchen: DishKitchen;
  category: DishCategory;
  isVeg: boolean;
  rdVerified: boolean;
  rdNote?: string;
  prepTime: string;
  macros: DishMacros;
  ingredients: string[];
  allergens: string[];
  glycaemicIndex: "low" | "medium" | "high";
  sugarPerServing: string;
  customizations: DishCustomGroup[];
  pairingSlug?: string;
  isAvailable: boolean;
}

export const CATEGORY_LABELS: Record<DishCategory, string> = {
  wellness: "Wellness",
  performance: "Performance",
  clinical: "Clinical",
  desserts: "Desserts",
};

export const DISHES: DishData[] = [
  {
    id: 1,
    slug: "grilled-salmon",
    name: "Grilled Atlantic Salmon",
    description:
      "Omega-3 rich Atlantic salmon (180g) with quinoa pilaf and steamed broccoli. Cardiovascular wellness protocol.",
    longDescription:
      "2.4g of EPA/DHA omega-3 fatty acids per serving, supporting cardiovascular health and reduced inflammation. 35P/35C/30F macro split.",
    image: "/dishes/salmon-quinoa.jpg",
    price: 48500,
    kitchen: "continental",
    category: "clinical",
    isVeg: false,
    rdVerified: true,
    rdNote:
      "Verified by Dr. Priya Sharma, RD (IN-78234). Recommended for elevated triglycerides or inflammatory markers.",
    prepTime: "22 min",
    macros: { protein: 34, carbs: 28, fat: 18, fiber: 6, calories: 420 },
    ingredients: [
      "Atlantic Salmon Fillet (180g, ASC-certified)",
      "Quinoa (80g dry)",
      "Broccoli Florets (120g)",
      "Extra Virgin Olive Oil (10ml)",
      "Lemon Juice, Fresh Herbs, Sea Salt",
    ],
    allergens: ["Fish"],
    glycaemicIndex: "low",
    sugarPerServing: "2g",
    customizations: [
      {
        groupName: "Protein Source",
        type: "single",
        options: [
          { name: "Atlantic Salmon (Default)", priceModifier: 0, default: true },
          { name: "Wild Sea Bass", priceModifier: 3500 },
          { name: "Organic Tofu (Vegan)", priceModifier: -1500 },
          { name: "Grass-Fed Chicken Breast", priceModifier: -500 },
        ],
      },
      {
        groupName: "Carbohydrate Base",
        type: "single",
        options: [
          { name: "Quinoa Pilaf (Default)", priceModifier: 0, default: true },
          { name: "Cauliflower Rice (Keto)", priceModifier: 0 },
          { name: "Brown Jasmine Rice", priceModifier: 500 },
          { name: "Sweet Potato Mash", priceModifier: 1000 },
        ],
      },
      {
        groupName: "Add-ons",
        type: "multiple",
        options: [
          { name: "Extra Salmon Portion (+80g)", priceModifier: 2500 },
          { name: "Avocado Slices (50g)", priceModifier: 1200 },
          { name: "Poached Egg", priceModifier: 800 },
          { name: "Mixed Seeds (Chia + Flax)", priceModifier: 600 },
          { name: "Greek Yogurt Dressing", priceModifier: 400 },
        ],
      },
    ],
    pairingSlug: "smoothie-bowl",
    isAvailable: true,
  },
  {
    id: 2,
    slug: "power-bowl",
    name: "Performance Power Bowl",
    description:
      "Grilled chicken, brown rice, sweet potato, avocado — engineered for athletic recovery and muscle synthesis.",
    longDescription:
      "Designed for the 90-minute post-workout window. Complete amino profile + slow carbs to rebuild glycogen.",
    image: "/dishes/buddha-bowl.jpg",
    price: 39500,
    kitchen: "continental",
    category: "performance",
    isVeg: false,
    rdVerified: true,
    rdNote: "42g protein hits the upper bound of single-meal MPS for most athletes (1.6–2.2 g/kg/day budget).",
    prepTime: "18 min",
    macros: { protein: 42, carbs: 55, fat: 22, fiber: 9, calories: 580 },
    ingredients: [
      "Grass-fed Chicken Breast (160g)",
      "Brown Rice (90g dry)",
      "Roasted Sweet Potato (100g)",
      "Avocado (50g)",
      "Spinach, Pumpkin Seeds, Tahini",
    ],
    allergens: ["Sesame"],
    glycaemicIndex: "medium",
    sugarPerServing: "6g",
    customizations: [
      {
        groupName: "Protein Source",
        type: "single",
        options: [
          { name: "Grass-Fed Chicken (Default)", priceModifier: 0, default: true },
          { name: "Grilled Tofu (Vegan)", priceModifier: -1000 },
          { name: "Atlantic Salmon", priceModifier: 2500 },
          { name: "Lean Beef Strips", priceModifier: 1500 },
        ],
      },
      {
        groupName: "Carbohydrate Base",
        type: "single",
        options: [
          { name: "Brown Rice (Default)", priceModifier: 0, default: true },
          { name: "Quinoa", priceModifier: 500 },
          { name: "Cauliflower Rice (Keto)", priceModifier: 0 },
        ],
      },
      {
        groupName: "Add-ons",
        type: "multiple",
        options: [
          { name: "Extra Chicken Portion (+80g)", priceModifier: 2000 },
          { name: "Boiled Egg Whites (3)", priceModifier: 600 },
          { name: "Tahini Drizzle", priceModifier: 300 },
        ],
      },
    ],
    pairingSlug: "miso-cod",
    isAvailable: true,
  },
  {
    id: 3,
    slug: "keto-ribeye",
    name: "Keto Prime Ribeye",
    description: "Grass-fed ribeye with cauliflower puree and grilled asparagus. Ketogenic macro ratio for metabolic efficiency.",
    longDescription: "70/25/5 fat-protein-carb ratio. For users in nutritional ketosis or low-carb metabolic protocols.",
    image: "/dishes/steak-keto.jpg",
    price: 62500,
    kitchen: "continental",
    category: "clinical",
    isVeg: false,
    rdVerified: true,
    rdNote: "Suitable for low-carb / ketogenic protocols. Not recommended without RD supervision for >12 weeks.",
    prepTime: "26 min",
    macros: { protein: 48, carbs: 8, fat: 38, fiber: 5, calories: 540 },
    ingredients: [
      "Grass-fed Ribeye (200g)",
      "Cauliflower Puree (150g)",
      "Grilled Asparagus (100g)",
      "Grass-fed Butter (15g)",
      "Rosemary, Black Pepper",
    ],
    allergens: ["Dairy"],
    glycaemicIndex: "low",
    sugarPerServing: "1g",
    customizations: [
      {
        groupName: "Doneness",
        type: "single",
        options: [
          { name: "Medium Rare (Default)", priceModifier: 0, default: true },
          { name: "Medium", priceModifier: 0 },
          { name: "Medium Well", priceModifier: 0 },
          { name: "Well Done", priceModifier: 0 },
        ],
      },
      {
        groupName: "Add-ons",
        type: "multiple",
        options: [
          { name: "Avocado Slices (50g)", priceModifier: 1200 },
          { name: "Truffle Butter (10g)", priceModifier: 1500 },
          { name: "Extra Asparagus (80g)", priceModifier: 600 },
        ],
      },
    ],
    pairingSlug: "miso-cod",
    isAvailable: true,
  },
  {
    id: 4,
    slug: "miso-cod",
    name: "Miso Glazed Black Cod",
    description: "Sustainably sourced black cod with bok choy and shiitake. Anti-inflammatory clinical nutrition protocol.",
    longDescription: "Marinated 24 hours in white miso. Buttery texture, low-glycaemic, omega-3 rich.",
    image: "/dishes/miso-cod.jpg",
    price: 54500,
    kitchen: "continental",
    category: "clinical",
    isVeg: false,
    rdVerified: true,
    prepTime: "24 min",
    macros: { protein: 32, carbs: 18, fat: 16, fiber: 4, calories: 360 },
    ingredients: [
      "Black Cod Fillet (160g)",
      "White Miso Marinade",
      "Bok Choy (100g)",
      "Shiitake Mushrooms (60g)",
      "Sesame Oil, Mirin",
    ],
    allergens: ["Fish", "Soy", "Sesame"],
    glycaemicIndex: "low",
    sugarPerServing: "5g",
    customizations: [
      {
        groupName: "Add-ons",
        type: "multiple",
        options: [
          { name: "Steamed Brown Rice (80g)", priceModifier: 500 },
          { name: "Extra Bok Choy", priceModifier: 400 },
          { name: "Pickled Ginger", priceModifier: 200 },
        ],
      },
    ],
    pairingSlug: "smoothie-bowl",
    isAvailable: true,
  },
  {
    id: 5,
    slug: "smoothie-bowl",
    name: "Superfood Smoothie Bowl",
    description: "Antioxidant-dense acai with berries, chia, and almonds. Micronutrient-optimized for cellular health.",
    longDescription: "Anthocyanins, polyphenols, and slow-release plant fats. Best as a recovery breakfast or post-workout.",
    image: "/dishes/smoothie-bowl.jpg",
    price: 28500,
    kitchen: "continental",
    category: "wellness",
    isVeg: true,
    rdVerified: true,
    prepTime: "8 min",
    macros: { protein: 12, carbs: 45, fat: 14, fiber: 11, calories: 340 },
    ingredients: [
      "Acai Pulp (100g)",
      "Mixed Berries (80g)",
      "Banana (50g)",
      "Chia Seeds (10g)",
      "Almond Butter (15g)",
      "Coconut Granola",
    ],
    allergens: ["Tree Nuts"],
    glycaemicIndex: "medium",
    sugarPerServing: "18g (natural fruit sugars)",
    customizations: [
      {
        groupName: "Protein Boost",
        type: "single",
        options: [
          { name: "No Protein (Default)", priceModifier: 0, default: true },
          { name: "Whey Isolate (25g)", priceModifier: 1500 },
          { name: "Plant Protein (Pea+Rice)", priceModifier: 1500 },
        ],
      },
      {
        groupName: "Toppings",
        type: "multiple",
        options: [
          { name: "Extra Granola", priceModifier: 300 },
          { name: "Cacao Nibs", priceModifier: 400 },
          { name: "Bee Pollen", priceModifier: 600 },
        ],
      },
    ],
    isAvailable: true,
  },
  {
    id: 6,
    slug: "mediterranean-salad",
    name: "Mediterranean Grain Salad",
    description: "Chickpeas, feta, olives, and fresh herbs with olive oil. Heart-healthy Mediterranean protocol.",
    longDescription: "Rooted in the Mediterranean diet — clinically associated with reduced cardiovascular risk.",
    image: "/dishes/mediterranean-salad.jpg",
    price: 32500,
    kitchen: "continental",
    category: "wellness",
    isVeg: true,
    rdVerified: false,
    prepTime: "10 min",
    macros: { protein: 18, carbs: 38, fat: 20, fiber: 10, calories: 380 },
    ingredients: [
      "Chickpeas (90g)",
      "Cherry Tomatoes (80g)",
      "Cucumber (60g)",
      "Feta Cheese (40g)",
      "Kalamata Olives, Parsley, Mint, Olive Oil",
    ],
    allergens: ["Dairy"],
    glycaemicIndex: "low",
    sugarPerServing: "4g",
    customizations: [
      {
        groupName: "Add-ons",
        type: "multiple",
        options: [
          { name: "Grilled Halloumi (60g)", priceModifier: 1200 },
          { name: "Quinoa Base (60g)", priceModifier: 600 },
          { name: "Extra Feta", priceModifier: 500 },
        ],
      },
    ],
    isAvailable: true,
  },
  {
    id: 7,
    slug: "kung-pao-tofu",
    name: "Kung Pao Tofu",
    description: "Crispy organic tofu with peanuts, dried chillies, and Sichuan peppercorns over steamed jasmine rice.",
    longDescription: "Plant-forward Sichuan classic, oil-controlled and lower-sodium than restaurant-style.",
    image: "/dishes/buddha-bowl.jpg",
    price: 34500,
    kitchen: "chinese",
    category: "wellness",
    isVeg: true,
    rdVerified: true,
    prepTime: "16 min",
    macros: { protein: 24, carbs: 48, fat: 16, fiber: 7, calories: 440 },
    ingredients: [
      "Organic Firm Tofu (180g)",
      "Roasted Peanuts (20g)",
      "Dried Sichuan Chillies",
      "Sichuan Peppercorns",
      "Bell Peppers, Spring Onion",
      "Steamed Jasmine Rice (100g)",
    ],
    allergens: ["Peanuts", "Soy", "Gluten"],
    glycaemicIndex: "medium",
    sugarPerServing: "7g",
    customizations: [
      {
        groupName: "Spice Level",
        type: "single",
        options: [
          { name: "Mild", priceModifier: 0 },
          { name: "Medium (Default)", priceModifier: 0, default: true },
          { name: "Sichuan Hot", priceModifier: 0 },
        ],
      },
      {
        groupName: "Carbohydrate Base",
        type: "single",
        options: [
          { name: "Jasmine Rice (Default)", priceModifier: 0, default: true },
          { name: "Brown Rice", priceModifier: 300 },
          { name: "Cauliflower Rice (Low Carb)", priceModifier: 0 },
        ],
      },
    ],
    pairingSlug: "steamed-bass",
    isAvailable: true,
  },
  {
    id: 8,
    slug: "steamed-bass",
    name: "Cantonese Steamed Sea Bass",
    description: "Whole sea bass steamed with ginger, scallion, and light soy. Cantonese minimalist protocol.",
    longDescription: "Steaming preserves omega-3s and protein quality. Low-sodium, low-fat, very high bioavailability.",
    image: "/dishes/miso-cod.jpg",
    price: 58500,
    kitchen: "chinese",
    category: "clinical",
    isVeg: false,
    rdVerified: true,
    rdNote: "Excellent post-recovery protein. Suitable for cardiac and renal-protective protocols.",
    prepTime: "20 min",
    macros: { protein: 38, carbs: 12, fat: 10, fiber: 2, calories: 320 },
    ingredients: [
      "Whole Sea Bass (220g)",
      "Fresh Ginger, Scallion",
      "Light Soy Sauce (low-sodium)",
      "Steamed Bok Choy",
    ],
    allergens: ["Fish", "Soy"],
    glycaemicIndex: "low",
    sugarPerServing: "1g",
    customizations: [
      {
        groupName: "Add-ons",
        type: "multiple",
        options: [
          { name: "Steamed Jasmine Rice (100g)", priceModifier: 400 },
          { name: "Extra Bok Choy", priceModifier: 400 },
          { name: "Chilli Oil (side)", priceModifier: 200 },
        ],
      },
    ],
    isAvailable: true,
  },
  {
    id: 9,
    slug: "dark-chocolate-mousse",
    name: "Dark Chocolate Avocado Mousse",
    description: "85% cocoa with avocado base, sweetened with date syrup. No refined sugar, no dairy.",
    longDescription: "High-flavanol cocoa + monounsaturated fats. RD-formulated dessert that fits a clinical macros budget.",
    image: "/dishes/smoothie-bowl.jpg",
    price: 18500,
    kitchen: "continental",
    category: "desserts",
    isVeg: true,
    rdVerified: true,
    rdNote: "Sweetened only with whole-fruit date paste. Suitable for low-glycaemic dessert needs.",
    prepTime: "5 min",
    macros: { protein: 5, carbs: 22, fat: 14, fiber: 6, calories: 220 },
    ingredients: [
      "85% Dark Cocoa (Fair Trade)",
      "Avocado (60g)",
      "Date Paste (15g)",
      "Vanilla Bean, Sea Salt",
    ],
    allergens: [],
    glycaemicIndex: "low",
    sugarPerServing: "9g (date paste only)",
    customizations: [
      {
        groupName: "Toppings",
        type: "multiple",
        options: [
          { name: "Cacao Nibs", priceModifier: 300 },
          { name: "Sea Salt Flakes", priceModifier: 100 },
          { name: "Fresh Raspberries", priceModifier: 500 },
        ],
      },
    ],
    isAvailable: true,
  },
  {
    id: 10,
    slug: "vegan-protein-wrap",
    name: "Tempeh Multigrain Wrap",
    description: "Marinated tempeh, hummus, pickled veg, and greens in a multigrain wrap. Plant-protein lunch.",
    longDescription: "Complete amino profile from fermented soy. Walking-friendly portable lunch.",
    image: "/dishes/buddha-bowl.jpg",
    price: 29500,
    kitchen: "continental",
    category: "wellness",
    isVeg: true,
    rdVerified: true,
    prepTime: "10 min",
    macros: { protein: 22, carbs: 42, fat: 14, fiber: 8, calories: 380 },
    ingredients: [
      "Tempeh (120g)",
      "Multigrain Wrap (whole-wheat + flax)",
      "Hummus (40g)",
      "Pickled Carrot & Cucumber",
      "Mixed Greens",
    ],
    allergens: ["Soy", "Gluten", "Sesame"],
    glycaemicIndex: "medium",
    sugarPerServing: "5g",
    customizations: [
      {
        groupName: "Wrap",
        type: "single",
        options: [
          { name: "Multigrain (Default)", priceModifier: 0, default: true },
          { name: "Spinach Wrap", priceModifier: 200 },
          { name: "Gluten-Free Wrap", priceModifier: 500 },
          { name: "No Wrap (Bowl)", priceModifier: -200 },
        ],
      },
      {
        groupName: "Add-ons",
        type: "multiple",
        options: [
          { name: "Avocado", priceModifier: 1000 },
          { name: "Extra Tempeh", priceModifier: 1500 },
          { name: "Sweet Potato Fries (side)", priceModifier: 1200 },
        ],
      },
    ],
    pairingSlug: "smoothie-bowl",
    isAvailable: true,
  },
];

export function getDishBySlug(slug: string): DishData | undefined {
  return DISHES.find((d) => d.slug === slug);
}

export function getDishById(id: number): DishData | undefined {
  return DISHES.find((d) => d.id === id);
}

export function getDishAllergens(slug: string): string[] | null {
  const d = getDishBySlug(slug);
  return d ? d.allergens : null;
}

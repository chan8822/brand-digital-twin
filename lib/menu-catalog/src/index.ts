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

  export type DishCategory =
    | "beverages"
    | "breakfast"
    | "salads"
    | "soups"
    | "pasta"
    | "wraps"
    | "bowls"
    | "snacks"
    | "mains";
  export type DishKitchen = "continental" | "indian" | "asian" | "mediterranean";

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
    averageRating?: number | null;
    reviewCount?: number;
  }

  export const CATEGORY_LABELS: Record<DishCategory, string> = {
    beverages: "Beverages",
    breakfast: "Breakfast",
    salads: "Salads",
    soups: "Soups",
    pasta: "Pasta",
    wraps: "Wraps & Sandwiches",
    bowls: "Rice Bowls",
    snacks: "Snacks & Bakes",
    mains: "Mains",
  };

  export const KITCHEN_LABELS: Record<DishKitchen, string> = {
    continental: "Continental",
    indian: "Indian",
    asian: "Asian",
    mediterranean: "Mediterranean",
  };

  export const DISHES: DishData[] = [
  {
    "id": 1,
    "slug": "activated-charcoal-smoothie",
    "name": "Activated Charcoal Smoothie",
    "description": "Activated charcoal powder, Banana, Almond milk / low, and more.",
    "longDescription": "Activated charcoal powder – ½ tsp · Banana – 1 medium (ripe) · Almond milk / low-fat milk – 200 ml · Honey – 1 tsp (optional) · Chia seeds – 1 tsp · Ice cubes – 4–5",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 5000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Activated charcoal powder – ½ tsp",
      "Banana – 1 medium (ripe)",
      "Almond milk / low-fat milk – 200 ml",
      "Honey – 1 tsp (optional)",
      "Chia seeds – 1 tsp",
      "Ice cubes – 4–5"
    ],
    "allergens": [
      "Dairy",
      "Tree Nuts"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 2,
    "slug": "aglio-olio-veg",
    "name": "Aglio Olio - Veg",
    "description": "Spaghetti pasta, Olive oil, Garlic, and more.",
    "longDescription": "Spaghetti pasta – 120 g (boiled al dente) · Olive oil – 2 tbsp · Garlic – 6–8 cloves (sliced) · Dry red chili flakes – ½ tsp · Zucchini, bell peppers, broccoli – ½ cup (mixed, cut into strips) · Parsley – 1 tbsp (chopped)",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 13000,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 14,
      "carbs": 65,
      "fat": 22,
      "fiber": 5,
      "calories": 480
    },
    "ingredients": [
      "Spaghetti pasta – 120 g (boiled al dente)",
      "Olive oil – 2 tbsp",
      "Garlic – 6–8 cloves (sliced)",
      "Dry red chili flakes – ½ tsp",
      "Zucchini, bell peppers, broccoli – ½ cup (mixed, cut into strips)",
      "Parsley – 1 tbsp (chopped)",
      "Salt – to taste",
      "Black pepper – ¼ tsp",
      "Parmesan cheese (optional) – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 3,
    "slug": "aglio-olio-chicken",
    "name": "Aglio Olio - Chicken",
    "description": "Spaghetti pasta, Olive oil, Garlic, and more.",
    "longDescription": "Spaghetti pasta – 120 g (boiled al dente) · Olive oil – 2 tbsp · Garlic – 6–8 cloves (sliced) · Chili flakes – ½ tsp · Grilled chicken breast – 100 g (sliced strips) · Parsley – 1 tbsp (chopped)",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 18000,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 22,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Spaghetti pasta – 120 g (boiled al dente)",
      "Olive oil – 2 tbsp",
      "Garlic – 6–8 cloves (sliced)",
      "Chili flakes – ½ tsp",
      "Grilled chicken breast – 100 g (sliced strips)",
      "Parsley – 1 tbsp (chopped)",
      "Salt – to taste",
      "Black pepper – ¼ tsp",
      "Parmesan cheese (optional) – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 4,
    "slug": "aglio-olio-prawns",
    "name": "Aglio Olio - Prawns",
    "description": "Spaghetti pasta, Olive oil, Garlic, and more.",
    "longDescription": "Spaghetti pasta – 120 g (boiled al dente) · Olive oil – 2 tbsp · Garlic – 6–8 cloves (sliced) · Chili flakes – ½ tsp · Prawns – 6–8 medium (cleaned & deveined) · Parsley – 1 tbsp (chopped)",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 20000,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 22,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Spaghetti pasta – 120 g (boiled al dente)",
      "Olive oil – 2 tbsp",
      "Garlic – 6–8 cloves (sliced)",
      "Chili flakes – ½ tsp",
      "Prawns – 6–8 medium (cleaned & deveined)",
      "Parsley – 1 tbsp (chopped)",
      "Salt – to taste",
      "Black pepper – ¼ tsp",
      "Parmesan cheese (optional) – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten",
      "Shellfish"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 5,
    "slug": "alfredo-pasta-veg",
    "name": "Alfredo Pasta - Veg",
    "description": "Spaghetti/Fettuccine pasta, Olive oil, Garlic, and more.",
    "longDescription": "Spaghetti/Fettuccine pasta – 120 g (boiled al dente) · Olive oil – 1 tbsp · Garlic – 5 g (minced) · Butter – 10 g · Fresh cream – 100 ml · Parmesan cheese – 20 g",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 17500,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 14,
      "carbs": 65,
      "fat": 22,
      "fiber": 5,
      "calories": 480
    },
    "ingredients": [
      "Spaghetti/Fettuccine pasta – 120 g (boiled al dente)",
      "Olive oil – 1 tbsp",
      "Garlic – 5 g (minced)",
      "Butter – 10 g",
      "Fresh cream – 100 ml",
      "Parmesan cheese – 20 g",
      "Mixed vegetables (broccoli, zucchini, bell peppers) – 70 g",
      "Salt – to taste",
      "Black pepper – ¼ tsp",
      "Parsley – 1 tbsp (chopped)"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 6,
    "slug": "alfredo-pasta-chicken",
    "name": "Alfredo Pasta - Chicken",
    "description": "Pasta, Olive oil, Garlic, and more.",
    "longDescription": "Pasta – 120 g (boiled) · Olive oil – 1 tbsp · Garlic – 5 g (minced) · Butter – 10 g · Fresh cream – 100 ml · Parmesan cheese – 20 g",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 22500,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 22,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Pasta – 120 g (boiled)",
      "Olive oil – 1 tbsp",
      "Garlic – 5 g (minced)",
      "Butter – 10 g",
      "Fresh cream – 100 ml",
      "Parmesan cheese – 20 g",
      "Grilled chicken breast – 100 g (sliced strips)",
      "Salt & pepper – to taste",
      "Parsley – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 7,
    "slug": "alfredo-pasta-prawns",
    "name": "Alfredo Pasta - Prawns",
    "description": "Pasta, Olive oil, Garlic, and more.",
    "longDescription": "Pasta – 120 g (boiled) · Olive oil – 1 tbsp · Garlic – 5 g (minced) · Butter – 10 g · Fresh cream – 100 ml · Parmesan cheese – 20 g",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 24500,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 22,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Pasta – 120 g (boiled)",
      "Olive oil – 1 tbsp",
      "Garlic – 5 g (minced)",
      "Butter – 10 g",
      "Fresh cream – 100 ml",
      "Parmesan cheese – 20 g",
      "Prawns – 6–8 medium (cleaned & deveined)",
      "Salt & pepper – to taste",
      "Parsley – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten",
      "Shellfish"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 8,
    "slug": "aliya-viral-beetroot-curd",
    "name": "Aliya Viral Beetroot Curd",
    "description": "Beetroot, Hung curd, Garlic, and more.",
    "longDescription": "Beetroot – 80 g (boiled & grated) · Hung curd – 150 g · Garlic – 1 clove (crushed) · Olive oil – 1 tsp · Green chili – 1 (chopped) · Salt – to taste",
    "image": "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=800&q=80",
    "price": 14500,
    "kitchen": "indian",
    "category": "mains",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 22,
      "carbs": 30,
      "fat": 14,
      "fiber": 5,
      "calories": 360
    },
    "ingredients": [
      "Beetroot – 80 g (boiled & grated)",
      "Hung curd – 150 g",
      "Garlic – 1 clove (crushed)",
      "Olive oil – 1 tsp",
      "Green chili – 1 (chopped)",
      "Salt – to taste",
      "Coriander leaves – 1 tbsp (chopped)"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 9,
    "slug": "almond-chicken-salad",
    "name": "Almond Chicken Salad",
    "description": "Grilled chicken breast, Lettuce, Cucumber, and more.",
    "longDescription": "Grilled chicken breast – 120 g (cubed) · Lettuce – 50 g · Cucumber – 40 g (sliced) · Cherry tomatoes – 50 g · Almonds – 20 g (toasted) · Olive oil – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 15500,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 26,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 320
    },
    "ingredients": [
      "Grilled chicken breast – 120 g (cubed)",
      "Lettuce – 50 g",
      "Cucumber – 40 g (sliced)",
      "Cherry tomatoes – 50 g",
      "Almonds – 20 g (toasted)",
      "Olive oil – 1 tbsp",
      "Lemon juice – 1 tbsp",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Tree Nuts"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 10,
    "slug": "amaranth-porridge-with-blueberry-sauce",
    "name": "Amaranth Porridge with Blueberry Sauce",
    "description": "Amaranth seeds, Almond milk, Honey, and more.",
    "longDescription": "Amaranth seeds – 50 g · Almond milk – 200 ml · Honey – 1 tsp · Blueberries – 50 g (fresh/frozen) · Lemon juice – ½ tsp · Cinnamon powder – a pinch",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Amaranth seeds – 50 g",
      "Almond milk – 200 ml",
      "Honey – 1 tsp",
      "Blueberries – 50 g (fresh/frozen)",
      "Lemon juice – ½ tsp",
      "Cinnamon powder – a pinch"
    ],
    "allergens": [
      "Dairy",
      "Tree Nuts"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 11,
    "slug": "antioxidant-detox",
    "name": "Antioxidant Detox",
    "description": "Spinach, Cucumber, Green apple, and more.",
    "longDescription": "Spinach – 30 g · Cucumber – 50 g · Green apple – 1 small · Lemon juice – 1 tbsp · Ginger – ½ inch · Water – 150 ml",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 17000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Spinach – 30 g",
      "Cucumber – 50 g",
      "Green apple – 1 small",
      "Lemon juice – 1 tbsp",
      "Ginger – ½ inch",
      "Water – 150 ml",
      "Ice – 3–4 cubes"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 12,
    "slug": "apple-cinnamon-smoothie",
    "name": "Apple Cinnamon Smoothie",
    "description": "Apple, Almond milk, Oats, and more.",
    "longDescription": "Apple – 1 medium (peeled & chopped) · Almond milk – 200 ml · Oats – 2 tbsp (soaked) · Cinnamon powder – ¼ tsp · Honey – 1 tsp · Ice cubes – 3–4",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 15000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Apple – 1 medium (peeled & chopped)",
      "Almond milk – 200 ml",
      "Oats – 2 tbsp (soaked)",
      "Cinnamon powder – ¼ tsp",
      "Honey – 1 tsp",
      "Ice cubes – 3–4"
    ],
    "allergens": [
      "Dairy",
      "Tree Nuts"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 13,
    "slug": "arrabbiata-veg",
    "name": "Arrabbiata - Veg",
    "description": "Penne pasta, Olive oil, Garlic, and more.",
    "longDescription": "Penne pasta – 120 g (boiled) · Olive oil – 1 tbsp · Garlic – 5 g (chopped) · Tomato puree – 100 g · Chili flakes – ½ tsp · Mixed veggies (zucchini, bell peppers, broccoli) – 70 g",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 12500,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 14,
      "carbs": 65,
      "fat": 18,
      "fiber": 5,
      "calories": 480
    },
    "ingredients": [
      "Penne pasta – 120 g (boiled)",
      "Olive oil – 1 tbsp",
      "Garlic – 5 g (chopped)",
      "Tomato puree – 100 g",
      "Chili flakes – ½ tsp",
      "Mixed veggies (zucchini, bell peppers, broccoli) – 70 g",
      "Salt – to taste",
      "Basil – 1 tsp (chopped)"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 14,
    "slug": "arrabbiata-chicken",
    "name": "Arrabbiata - Chicken",
    "description": "Penne pasta, Olive oil, Garlic, and more.",
    "longDescription": "Penne pasta – 120 g (boiled) · Olive oil – 1 tbsp · Garlic – 5 g · Tomato puree – 100 g · Chili flakes – ½ tsp · Grilled chicken – 100 g (sliced)",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 17500,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 18,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Penne pasta – 120 g (boiled)",
      "Olive oil – 1 tbsp",
      "Garlic – 5 g",
      "Tomato puree – 100 g",
      "Chili flakes – ½ tsp",
      "Grilled chicken – 100 g (sliced)",
      "Salt – to taste",
      "Basil – 1 tsp"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 15,
    "slug": "arrabbiata-prawns",
    "name": "Arrabbiata - Prawns",
    "description": "Penne pasta, Olive oil, Garlic, and more.",
    "longDescription": "Penne pasta – 120 g (boiled) · Olive oil – 1 tbsp · Garlic – 5 g · Tomato puree – 100 g · Chili flakes – ½ tsp · Prawns – 6–8 medium (cleaned)",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 16000,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 18,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Penne pasta – 120 g (boiled)",
      "Olive oil – 1 tbsp",
      "Garlic – 5 g",
      "Tomato puree – 100 g",
      "Chili flakes – ½ tsp",
      "Prawns – 6–8 medium (cleaned)",
      "Salt – to taste",
      "Basil – 1 tsp"
    ],
    "allergens": [
      "Gluten",
      "Shellfish"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 16,
    "slug": "avocado-toast",
    "name": "Avocado Toast",
    "description": "Whole grain bread, Avocado, Lemon juice, and more.",
    "longDescription": "Whole grain bread – 2 slices · Avocado – 1 medium (mashed, ~100 g) · Lemon juice – ½ tsp · Salt & black pepper – to taste · Olive oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 24000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 20,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Whole grain bread – 2 slices",
      "Avocado – 1 medium (mashed, ~100 g)",
      "Lemon juice – ½ tsp",
      "Salt & black pepper – to taste",
      "Olive oil – 1 tsp"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 17,
    "slug": "avocado-toast-with-poached-boiled-egg",
    "name": "Avocado Toast with Poached Boiled Egg",
    "description": "Whole grain bread, Avocado, Lemon juice, and more.",
    "longDescription": "Whole grain bread – 2 slices · Avocado – 100 g (mashed) · Lemon juice – ½ tsp · Poached egg – 1 · Salt, pepper – to taste",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 28000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 20,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Whole grain bread – 2 slices",
      "Avocado – 100 g (mashed)",
      "Lemon juice – ½ tsp",
      "Poached egg – 1",
      "Salt, pepper – to taste"
    ],
    "allergens": [
      "Eggs",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 18,
    "slug": "avocado-toast-with-sunny-side-up",
    "name": "Avocado Toast with Sunny Side Up",
    "description": "Whole grain bread, Avocado, Lemon juice, and more.",
    "longDescription": "Whole grain bread – 2 slices · Avocado – 100 g · Lemon juice – ½ tsp · Egg – 1 (fried sunny side up) · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 28000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 20,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Whole grain bread – 2 slices",
      "Avocado – 100 g",
      "Lemon juice – ½ tsp",
      "Egg – 1 (fried sunny side up)",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Eggs",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 19,
    "slug": "barbeque-chicken-burrito-wrap",
    "name": "Barbeque Chicken Burrito Wrap",
    "description": "Whole wheat tortilla, Grilled chicken, BBQ sauce, and more.",
    "longDescription": "Whole wheat tortilla – 1 large · Grilled chicken – 100 g (shredded) · BBQ sauce – 2 tbsp · Bell peppers & onions – 50 g (sautéed) · Lettuce – 20 g · Cheese – 20 g (optional)",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 16000,
    "kitchen": "continental",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 18,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Whole wheat tortilla – 1 large",
      "Grilled chicken – 100 g (shredded)",
      "BBQ sauce – 2 tbsp",
      "Bell peppers & onions – 50 g (sautéed)",
      "Lettuce – 20 g",
      "Cheese – 20 g (optional)"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 20,
    "slug": "barbeque-grilled-chicken-rice-bowl",
    "name": "Barbeque Grilled Chicken Rice Bowl",
    "description": "Brown rice, Grilled chicken, BBQ sauce, and more.",
    "longDescription": "Brown rice – 150 g (cooked) · Grilled chicken – 120 g · BBQ sauce – 2 tbsp · Steamed broccoli & carrots – 70 g · Olive oil – 1 tsp · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 17000,
    "kitchen": "continental",
    "category": "bowls",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 34,
      "carbs": 60,
      "fat": 14,
      "fiber": 7,
      "calories": 540
    },
    "ingredients": [
      "Brown rice – 150 g (cooked)",
      "Grilled chicken – 120 g",
      "BBQ sauce – 2 tbsp",
      "Steamed broccoli & carrots – 70 g",
      "Olive oil – 1 tsp",
      "Salt & pepper – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 21,
    "slug": "barbeque-paneer-fiesta-rice-bowl",
    "name": "Barbeque Paneer Fiesta Rice Bowl",
    "description": "Brown rice, Paneer, BBQ sauce, and more.",
    "longDescription": "Brown rice – 150 g (cooked) · Paneer – 120 g (grilled cubes) · BBQ sauce – 2 tbsp · Veggies (broccoli, zucchini, bell peppers) – 70 g · Olive oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 16500,
    "kitchen": "indian",
    "category": "bowls",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 22,
      "carbs": 60,
      "fat": 18,
      "fiber": 7,
      "calories": 460
    },
    "ingredients": [
      "Brown rice – 150 g (cooked)",
      "Paneer – 120 g (grilled cubes)",
      "BBQ sauce – 2 tbsp",
      "Veggies (broccoli, zucchini, bell peppers) – 70 g",
      "Olive oil – 1 tsp"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 22,
    "slug": "blueberry-smoothie",
    "name": "Blueberry Smoothie",
    "description": "Blueberries, Banana, Yogurt / almond milk, and more.",
    "longDescription": "Blueberries – 70 g (fresh/frozen) · Banana – 1 small (50 g) · Yogurt / almond milk – 200 ml · Honey – 1 tsp · Ice cubes – 3–4",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 23000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Blueberries – 70 g (fresh/frozen)",
      "Banana – 1 small (50 g)",
      "Yogurt / almond milk – 200 ml",
      "Honey – 1 tsp",
      "Ice cubes – 3–4"
    ],
    "allergens": [
      "Dairy",
      "Tree Nuts"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 23,
    "slug": "broccoli-almond-soup",
    "name": "Broccoli Almond Soup",
    "description": "Broccoli, Almonds, Onion, and more.",
    "longDescription": "Broccoli – 100 g (florets) · Almonds – 10 pcs (soaked & peeled) · Onion – 20 g (chopped) · Garlic – 5 g · Olive oil – 1 tsp · Veg stock / water – 200 ml",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 9500,
    "kitchen": "continental",
    "category": "soups",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 6,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Broccoli – 100 g (florets)",
      "Almonds – 10 pcs (soaked & peeled)",
      "Onion – 20 g (chopped)",
      "Garlic – 5 g",
      "Olive oil – 1 tsp",
      "Veg stock / water – 200 ml",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Tree Nuts"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 24,
    "slug": "broccoli-babycorn-tomato-salad",
    "name": "Broccoli Babycorn Tomato Salad",
    "description": "Broccoli, Babycorn, Cherry tomatoes, and more.",
    "longDescription": "Broccoli – 80 g · Babycorn – 60 g (blanched) · Cherry tomatoes – 50 g · Olive oil – 1 tbsp · Lemon juice – ½ tbsp · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 10000,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Broccoli – 80 g",
      "Babycorn – 60 g (blanched)",
      "Cherry tomatoes – 50 g",
      "Olive oil – 1 tbsp",
      "Lemon juice – ½ tbsp",
      "Salt & pepper – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 25,
    "slug": "broccoli-lemon-chicken-salad",
    "name": "Broccoli Lemon Chicken Salad",
    "description": "Grilled chicken, Broccoli, Lettuce, and more.",
    "longDescription": "Grilled chicken – 120 g · Broccoli – 80 g (steamed) · Lettuce – 40 g · Olive oil – 1 tbsp · Lemon juice – 1 tbsp · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 15500,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 26,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 320
    },
    "ingredients": [
      "Grilled chicken – 120 g",
      "Broccoli – 80 g (steamed)",
      "Lettuce – 40 g",
      "Olive oil – 1 tbsp",
      "Lemon juice – 1 tbsp",
      "Salt & pepper – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 26,
    "slug": "cheese-omelette",
    "name": "Cheese Omelette",
    "description": "Eggs, Milk, Cheese, and more.",
    "longDescription": "Eggs – 2 · Milk – 20 ml · Cheese – 20 g (grated) · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 18,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Milk – 20 ml",
      "Cheese – 20 g (grated)",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs",
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 27,
    "slug": "cheese-tomato-omelette",
    "name": "Cheese Tomato Omelette",
    "description": "Eggs, Tomato, Cheese, and more.",
    "longDescription": "Eggs – 2 · Tomato – 40 g (chopped) · Cheese – 20 g · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 18,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Tomato – 40 g (chopped)",
      "Cheese – 20 g",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs",
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 28,
    "slug": "cheesy-delight-nachos",
    "name": "Cheesy Delight Nachos",
    "description": "Nachos chips, Cheese sauce, Jalapeños, and more.",
    "longDescription": "Nachos chips – 100 g · Cheese sauce – 50 g · Jalapeños – 20 g · Salsa – 30 g · Sour cream – 20 g",
    "image": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80",
    "price": 13000,
    "kitchen": "continental",
    "category": "snacks",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 6,
      "carbs": 30,
      "fat": 14,
      "fiber": 3,
      "calories": 240
    },
    "ingredients": [
      "Nachos chips – 100 g",
      "Cheese sauce – 50 g",
      "Jalapeños – 20 g",
      "Salsa – 30 g",
      "Sour cream – 20 g"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 29,
    "slug": "chia-lemonade-smoothie",
    "name": "Chia Lemonade Smoothie",
    "description": "Chia seeds, Lemon juice, Honey, and more.",
    "longDescription": "Chia seeds – 2 tsp (soaked in water 15 min) · Lemon juice – 1 tbsp · Honey – 1 tsp · Water – 200 ml · Ice cubes – 3–4",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Chia seeds – 2 tsp (soaked in water 15 min)",
      "Lemon juice – 1 tbsp",
      "Honey – 1 tsp",
      "Water – 200 ml",
      "Ice cubes – 3–4"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 30,
    "slug": "chicken-amigos-sandwich",
    "name": "Chicken Amigos Sandwich",
    "description": "Multigrain bread, Grilled chicken, Lettuce, and more.",
    "longDescription": "Multigrain bread – 2 slices · Grilled chicken – 100 g (sliced) · Lettuce – 20 g · Tomato – 30 g (sliced) · Cucumber – 20 g (sliced) · Ranch/mayo – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 14500,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Multigrain bread – 2 slices",
      "Grilled chicken – 100 g (sliced)",
      "Lettuce – 20 g",
      "Tomato – 30 g (sliced)",
      "Cucumber – 20 g (sliced)",
      "Ranch/mayo – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 31,
    "slug": "chicken-caesar-story-salad",
    "name": "Chicken Caesar Story Salad",
    "description": "Romaine lettuce, Grilled chicken, Croutons, and more.",
    "longDescription": "Romaine lettuce – 80 g · Grilled chicken – 120 g (sliced) · Croutons – 20 g · Parmesan – 15 g (shaved) · Caesar dressing – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 20000,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 26,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 320
    },
    "ingredients": [
      "Romaine lettuce – 80 g",
      "Grilled chicken – 120 g (sliced)",
      "Croutons – 20 g",
      "Parmesan – 15 g (shaved)",
      "Caesar dressing – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 32,
    "slug": "chicken-hummus-pita",
    "name": "Chicken Hummus Pita",
    "description": "Pita bread, Grilled chicken, Hummus, and more.",
    "longDescription": "Pita bread – 1 · Grilled chicken – 100 g (sliced) · Hummus – 2 tbsp · Lettuce, cucumber, tomato – 50 g (mixed)",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 13000,
    "kitchen": "mediterranean",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Pita bread – 1",
      "Grilled chicken – 100 g (sliced)",
      "Hummus – 2 tbsp",
      "Lettuce, cucumber, tomato – 50 g (mixed)"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 33,
    "slug": "chicken-pita-pockets-with-hummus",
    "name": "Chicken Pita Pockets with Hummus",
    "description": "Mini pita breads, Grilled chicken, Hummus, and more.",
    "longDescription": "Mini pita breads – 2 · Grilled chicken – 80 g · Hummus – 2 tbsp · Onion & cucumber – 40 g (sliced)",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 11500,
    "kitchen": "mediterranean",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Mini pita breads – 2",
      "Grilled chicken – 80 g",
      "Hummus – 2 tbsp",
      "Onion & cucumber – 40 g (sliced)"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 34,
    "slug": "chicken-tikka-sandwich-with-ranch-yoghurt",
    "name": "Chicken Tikka Sandwich with Ranch Yoghurt",
    "description": "Bread slices, Chicken tikka, Lettuce, and more.",
    "longDescription": "Bread slices – 2 · Chicken tikka – 100 g (boneless pieces) · Lettuce – 20 g · Onion rings – 20 g · Ranch yogurt dip – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 15500,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Bread slices – 2",
      "Chicken tikka – 100 g (boneless pieces)",
      "Lettuce – 20 g",
      "Onion rings – 20 g",
      "Ranch yogurt dip – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 35,
    "slug": "chickpea-peanut-tabbouleh-salad",
    "name": "Chickpea & Peanut Tabbouleh Salad",
    "description": "Boiled chickpeas, Peanuts, Parsley, and more.",
    "longDescription": "Boiled chickpeas – 80 g · Peanuts – 20 g (roasted) · Parsley – 20 g (chopped) · Tomato – 40 g (diced) · Lemon juice – 1 tbsp · Olive oil – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 7500,
    "kitchen": "mediterranean",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Boiled chickpeas – 80 g",
      "Peanuts – 20 g (roasted)",
      "Parsley – 20 g (chopped)",
      "Tomato – 40 g (diced)",
      "Lemon juice – 1 tbsp",
      "Olive oil – 1 tbsp",
      "Salt – to taste"
    ],
    "allergens": [
      "Peanuts"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 36,
    "slug": "chilli-chipotle-paneer-burrito-wrap",
    "name": "Chilli Chipotle Paneer Burrito Wrap",
    "description": "Tortilla, Paneer, Chipotle sauce, and more.",
    "longDescription": "Tortilla – 1 large · Paneer – 100 g (grilled cubes) · Chipotle sauce – 2 tbsp · Bell peppers & onion – 50 g (sautéed) · Lettuce – 20 g · Rice (optional) – 50 g",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 15000,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 18,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Tortilla – 1 large",
      "Paneer – 100 g (grilled cubes)",
      "Chipotle sauce – 2 tbsp",
      "Bell peppers & onion – 50 g (sautéed)",
      "Lettuce – 20 g",
      "Rice (optional) – 50 g"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 37,
    "slug": "chilli-chipotle-paneer-rice-bowl",
    "name": "Chilli Chipotle Paneer Rice Bowl",
    "description": "Brown rice, Paneer, Bell peppers & onion, and more.",
    "longDescription": "Brown rice – 150 g (cooked) · Paneer – 120 g (grilled, tossed in chipotle sauce) · Bell peppers & onion – 50 g · Lettuce – 20 g",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 14000,
    "kitchen": "indian",
    "category": "bowls",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 22,
      "carbs": 60,
      "fat": 18,
      "fiber": 7,
      "calories": 460
    },
    "ingredients": [
      "Brown rice – 150 g (cooked)",
      "Paneer – 120 g (grilled, tossed in chipotle sauce)",
      "Bell peppers & onion – 50 g",
      "Lettuce – 20 g"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 38,
    "slug": "chipotle-chicken-burrito-wrap",
    "name": "Chipotle Chicken Burrito Wrap",
    "description": "Tortilla, Grilled chicken, Chipotle sauce, and more.",
    "longDescription": "Tortilla – 1 large · Grilled chicken – 120 g (sliced) · Chipotle sauce – 2 tbsp · Rice – 50 g (optional) · Onion & bell pepper – 40 g · Lettuce – 20 g",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 17000,
    "kitchen": "continental",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Tortilla – 1 large",
      "Grilled chicken – 120 g (sliced)",
      "Chipotle sauce – 2 tbsp",
      "Rice – 50 g (optional)",
      "Onion & bell pepper – 40 g",
      "Lettuce – 20 g"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 39,
    "slug": "chipotle-grilled-chicken-rice-bowl",
    "name": "Chipotle Grilled Chicken Rice Bowl",
    "description": "Brown rice, Grilled chicken, Chipotle sauce, and more.",
    "longDescription": "Brown rice – 150 g (cooked) · Grilled chicken – 120 g (sliced) · Chipotle sauce – 2 tbsp · Steamed veggies – 70 g",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 14500,
    "kitchen": "continental",
    "category": "bowls",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 34,
      "carbs": 60,
      "fat": 14,
      "fiber": 7,
      "calories": 540
    },
    "ingredients": [
      "Brown rice – 150 g (cooked)",
      "Grilled chicken – 120 g (sliced)",
      "Chipotle sauce – 2 tbsp",
      "Steamed veggies – 70 g"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 40,
    "slug": "classic-bread-omelette-2-egg",
    "name": "Classic Bread Omelette (2 Egg)",
    "description": "Eggs, Bread slices, Onion, and more.",
    "longDescription": "Eggs – 2 · Bread slices – 2 · Onion – 20 g (chopped) · Green chili – 1 (chopped) · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 6500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Bread slices – 2",
      "Onion – 20 g (chopped)",
      "Green chili – 1 (chopped)",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 41,
    "slug": "classic-nachos",
    "name": "Classic Nachos",
    "description": "Nachos chips, Salsa, Cheese sauce, and more.",
    "longDescription": "Nachos chips – 100 g · Salsa – 30 g · Cheese sauce – 50 g · Jalapeños – 20 g",
    "image": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80",
    "price": 11000,
    "kitchen": "continental",
    "category": "snacks",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 6,
      "carbs": 30,
      "fat": 14,
      "fiber": 3,
      "calories": 240
    },
    "ingredients": [
      "Nachos chips – 100 g",
      "Salsa – 30 g",
      "Cheese sauce – 50 g",
      "Jalapeños – 20 g"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 42,
    "slug": "classic-vegetable-poha",
    "name": "Classic Vegetable Poha",
    "description": "Flattened rice (poha), Onion, Tomato, and more.",
    "longDescription": "Flattened rice (poha) – 100 g · Onion – 30 g (chopped) · Tomato – 30 g (chopped) · Green chili – 1 · Curry leaves – 6–8 · Mustard seeds – ½ tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "indian",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Flattened rice (poha) – 100 g",
      "Onion – 30 g (chopped)",
      "Tomato – 30 g (chopped)",
      "Green chili – 1",
      "Curry leaves – 6–8",
      "Mustard seeds – ½ tsp",
      "Oil – 1 tsp",
      "Salt – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 43,
    "slug": "coke-can",
    "name": "Coke Can",
    "description": "Chef-prepared beverages.",
    "longDescription": "",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 44,
    "slug": "cream-of-broccoli",
    "name": "Cream of Broccoli",
    "description": "Broccoli, Onion, Garlic, and more.",
    "longDescription": "Broccoli – 100 g · Onion – 20 g · Garlic – 5 g · Butter – 10 g · Milk/cream – 100 ml · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 12500,
    "kitchen": "continental",
    "category": "soups",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 10,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Broccoli – 100 g",
      "Onion – 20 g",
      "Garlic – 5 g",
      "Butter – 10 g",
      "Milk/cream – 100 ml",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 45,
    "slug": "cream-of-chicken",
    "name": "Cream of Chicken",
    "description": "Chicken breast, Onion, Garlic, and more.",
    "longDescription": "Chicken breast – 120 g (boiled & shredded) · Onion – 20 g · Garlic – 5 g · Butter – 10 g · Milk/cream – 100 ml · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 16000,
    "kitchen": "continental",
    "category": "soups",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 10,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Chicken breast – 120 g (boiled & shredded)",
      "Onion – 20 g",
      "Garlic – 5 g",
      "Butter – 10 g",
      "Milk/cream – 100 ml",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 46,
    "slug": "cream-of-mushroom",
    "name": "Cream of Mushroom",
    "description": "Button mushrooms, Onion, Garlic, and more.",
    "longDescription": "Button mushrooms – 100 g (sliced) · Onion – 20 g · Garlic – 5 g · Butter – 10 g · Milk/cream – 100 ml · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 14500,
    "kitchen": "continental",
    "category": "soups",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 10,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Button mushrooms – 100 g (sliced)",
      "Onion – 20 g",
      "Garlic – 5 g",
      "Butter – 10 g",
      "Milk/cream – 100 ml",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 47,
    "slug": "creamy-egg-white-sandwich",
    "name": "Creamy Egg White Sandwich",
    "description": "Egg whites, Multigrain bread, Yogurt dressing, and more.",
    "longDescription": "Egg whites – 3 (boiled, chopped) · Multigrain bread – 2 slices · Yogurt dressing – 1 tbsp · Lettuce – 20 g · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 12500,
    "kitchen": "continental",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Egg whites – 3 (boiled, chopped)",
      "Multigrain bread – 2 slices",
      "Yogurt dressing – 1 tbsp",
      "Lettuce – 20 g",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Eggs",
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 48,
    "slug": "crispy-mushroom-burrito-wrap",
    "name": "Crispy Mushroom Burrito Wrap",
    "description": "Tortilla, Mushrooms, Lettuce, and more.",
    "longDescription": "Tortilla – 1 large · Mushrooms – 100 g (battered & fried) · Lettuce – 20 g · Bell peppers – 40 g · Salsa – 2 tbsp · Cheese – 20 g",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 19000,
    "kitchen": "continental",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 18,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Tortilla – 1 large",
      "Mushrooms – 100 g (battered & fried)",
      "Lettuce – 20 g",
      "Bell peppers – 40 g",
      "Salsa – 2 tbsp",
      "Cheese – 20 g"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 49,
    "slug": "crispy-mushroom-rice-bowl",
    "name": "Crispy Mushroom Rice Bowl",
    "description": "Brown rice, Mushrooms, Bell peppers & onion, and more.",
    "longDescription": "Brown rice – 150 g (cooked) · Mushrooms – 120 g (battered & fried) · Bell peppers & onion – 50 g (sautéed) · Lettuce – 20 g · Sauce/dip of choice – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 19000,
    "kitchen": "continental",
    "category": "bowls",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 22,
      "carbs": 60,
      "fat": 14,
      "fiber": 7,
      "calories": 460
    },
    "ingredients": [
      "Brown rice – 150 g (cooked)",
      "Mushrooms – 120 g (battered & fried)",
      "Bell peppers & onion – 50 g (sautéed)",
      "Lettuce – 20 g",
      "Sauce/dip of choice – 2 tbsp"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 50,
    "slug": "crispy-peri-peri-chicken-burrito-wrap",
    "name": "Crispy Peri Peri Chicken Burrito Wrap",
    "description": "Tortilla, Chicken strips, Lettuce, and more.",
    "longDescription": "Tortilla – 1 large · Chicken strips – 120 g (fried, peri peri spiced) · Lettuce – 20 g · Onion & bell peppers – 50 g · Peri peri mayo/sauce – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 23000,
    "kitchen": "continental",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Tortilla – 1 large",
      "Chicken strips – 120 g (fried, peri peri spiced)",
      "Lettuce – 20 g",
      "Onion & bell peppers – 50 g",
      "Peri peri mayo/sauce – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 51,
    "slug": "crispy-peri-peri-chicken-rice-bowl",
    "name": "Crispy Peri Peri Chicken Rice Bowl",
    "description": "Brown rice, Crispy peri peri chicken, Steamed vegetables, and more.",
    "longDescription": "Brown rice – 150 g (cooked) · Crispy peri peri chicken – 120 g · Steamed vegetables – 70 g · Peri peri mayo – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 22000,
    "kitchen": "continental",
    "category": "bowls",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 34,
      "carbs": 60,
      "fat": 14,
      "fiber": 7,
      "calories": 540
    },
    "ingredients": [
      "Brown rice – 150 g (cooked)",
      "Crispy peri peri chicken – 120 g",
      "Steamed vegetables – 70 g",
      "Peri peri mayo – 1 tbsp"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 52,
    "slug": "crispy-peri-peri-mushroom-burrito-wrap",
    "name": "Crispy Peri Peri Mushroom Burrito Wrap",
    "description": "Tortilla, Mushrooms, Bell peppers, and more.",
    "longDescription": "Tortilla – 1 large · Mushrooms – 120 g (crispy fried, peri peri spiced) · Bell peppers – 40 g · Lettuce – 20 g · Sauce – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 18500,
    "kitchen": "continental",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Tortilla – 1 large",
      "Mushrooms – 120 g (crispy fried, peri peri spiced)",
      "Bell peppers – 40 g",
      "Lettuce – 20 g",
      "Sauce – 2 tbsp"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 53,
    "slug": "crispy-peri-peri-mushroom-rice-bowl",
    "name": "Crispy Peri Peri Mushroom Rice Bowl",
    "description": "Brown rice, Crispy peri peri mushrooms, Veggies, and more.",
    "longDescription": "Brown rice – 150 g · Crispy peri peri mushrooms – 120 g · Veggies – 70 g · Sauce – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 17500,
    "kitchen": "continental",
    "category": "bowls",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 22,
      "carbs": 60,
      "fat": 14,
      "fiber": 7,
      "calories": 460
    },
    "ingredients": [
      "Brown rice – 150 g",
      "Crispy peri peri mushrooms – 120 g",
      "Veggies – 70 g",
      "Sauce – 1 tbsp"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 54,
    "slug": "crispy-peri-peri-potato-rice-bowl",
    "name": "Crispy Peri Peri Potato Rice Bowl",
    "description": "Brown rice, Potato wedges, Onion, bell peppers, and more.",
    "longDescription": "Brown rice – 150 g · Potato wedges – 120 g (fried, peri peri spiced) · Onion, bell peppers – 50 g · Lettuce – 20 g",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 22500,
    "kitchen": "continental",
    "category": "bowls",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 22,
      "carbs": 60,
      "fat": 14,
      "fiber": 7,
      "calories": 460
    },
    "ingredients": [
      "Brown rice – 150 g",
      "Potato wedges – 120 g (fried, peri peri spiced)",
      "Onion, bell peppers – 50 g",
      "Lettuce – 20 g"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 55,
    "slug": "dates-banana-smoothie",
    "name": "Dates Banana Smoothie",
    "description": "Banana, Dates, Almond milk, and more.",
    "longDescription": "Banana – 1 medium · Dates – 4 pcs (pitted) · Almond milk – 200 ml · Honey – 1 tsp · Ice cubes – 3–4",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 10500,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Banana – 1 medium",
      "Dates – 4 pcs (pitted)",
      "Almond milk – 200 ml",
      "Honey – 1 tsp",
      "Ice cubes – 3–4"
    ],
    "allergens": [
      "Dairy",
      "Tree Nuts"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 56,
    "slug": "diet-coke-can",
    "name": "Diet Coke Can",
    "description": "Diet Coke can.",
    "longDescription": "Diet Coke can – 1 (chilled)",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Diet Coke can – 1 (chilled)"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 57,
    "slug": "exotic-amaranth-blueberry-yogurt",
    "name": "Exotic Amaranth Blueberry Yogurt",
    "description": "Amaranth seeds, Yogurt, Blueberries, and more.",
    "longDescription": "Amaranth seeds – 50 g (cooked) · Yogurt – 100 g · Blueberries – 50 g · Honey – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Amaranth seeds – 50 g (cooked)",
      "Yogurt – 100 g",
      "Blueberries – 50 g",
      "Honey – 1 tsp"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 58,
    "slug": "exotic-egg-bhurji",
    "name": "Exotic Egg Bhurji",
    "description": "Eggs, Onion, Tomato, and more.",
    "longDescription": "Eggs – 3 · Onion – 40 g (chopped) · Tomato – 40 g (chopped) · Green chili – 1 · Oil – 1 tsp · Salt & turmeric – to taste",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 7500,
    "kitchen": "indian",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 3",
      "Onion – 40 g (chopped)",
      "Tomato – 40 g (chopped)",
      "Green chili – 1",
      "Oil – 1 tsp",
      "Salt & turmeric – to taste"
    ],
    "allergens": [
      "Eggs"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 59,
    "slug": "exotic-fruit-bowl",
    "name": "Exotic Fruit Bowl",
    "description": "Apple, Banana, Papaya, and more.",
    "longDescription": "Apple – 50 g · Banana – 50 g · Papaya – 50 g · Grapes – 30 g · Pomegranate – 30 g",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Apple – 50 g",
      "Banana – 50 g",
      "Papaya – 50 g",
      "Grapes – 30 g",
      "Pomegranate – 30 g"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 60,
    "slug": "falafal-hummus-wrap",
    "name": "Falafal Hummus Wrap",
    "description": "Tortilla/pita, Falafel, Hummus, and more.",
    "longDescription": "Tortilla/pita – 1 · Falafel – 3 pcs · Hummus – 2 tbsp · Onion & tomato slices – 40 g · Lettuce – 20 g",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 14500,
    "kitchen": "mediterranean",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Tortilla/pita – 1",
      "Falafel – 3 pcs",
      "Hummus – 2 tbsp",
      "Onion & tomato slices – 40 g",
      "Lettuce – 20 g"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 61,
    "slug": "falafal-pita-pockets-with-hummus",
    "name": "Falafal Pita Pockets with Hummus",
    "description": "Mini pita breads, Falafel, Hummus, and more.",
    "longDescription": "Mini pita breads – 2 · Falafel – 2 pcs each · Hummus – 1 tbsp each · Onion & cucumber – 30 g",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 14500,
    "kitchen": "mediterranean",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Mini pita breads – 2",
      "Falafel – 2 pcs each",
      "Hummus – 1 tbsp each",
      "Onion & cucumber – 30 g"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 62,
    "slug": "falafel-garden-salad",
    "name": "Falafel Garden Salad",
    "description": "Falafel, Lettuce, Tomato, and more.",
    "longDescription": "Falafel – 4 pcs (crumbled) · Lettuce – 50 g · Tomato – 40 g · Cucumber – 40 g · Olive oil – 1 tbsp · Lemon juice – ½ tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 11000,
    "kitchen": "mediterranean",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Falafel – 4 pcs (crumbled)",
      "Lettuce – 50 g",
      "Tomato – 40 g",
      "Cucumber – 40 g",
      "Olive oil – 1 tbsp",
      "Lemon juice – ½ tbsp",
      "Salt & pepper – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 63,
    "slug": "french-omelette-sweet-savoury",
    "name": "French Omelette (Sweet/Savoury)",
    "description": "Eggs, Butter, Salt, and more.",
    "longDescription": "Eggs – 3 · Butter – 10 g · Salt – a pinch · Sugar – 1 tsp · Honey – 1 tsp · Cheese – 20 g",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 10000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 18,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 3",
      "Butter – 10 g",
      "Salt – a pinch",
      "Sugar – 1 tsp",
      "Honey – 1 tsp",
      "Cheese – 20 g",
      "Herbs – 1 tsp"
    ],
    "allergens": [
      "Eggs",
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 64,
    "slug": "fruity-sprout-salad",
    "name": "Fruity Sprout Salad",
    "description": "Moong sprouts, Apple, Pomegranate, and more.",
    "longDescription": "Moong sprouts – 80 g · Apple – 40 g (chopped) · Pomegranate – 30 g · Orange segments – 30 g · Lemon juice – 1 tbsp · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 11000,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Moong sprouts – 80 g",
      "Apple – 40 g (chopped)",
      "Pomegranate – 30 g",
      "Orange segments – 30 g",
      "Lemon juice – 1 tbsp",
      "Salt & pepper – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 65,
    "slug": "fruity-yogurt",
    "name": "Fruity Yogurt",
    "description": "Yogurt, Banana, Apple, and more.",
    "longDescription": "Yogurt – 100 g · Banana – 50 g (sliced) · Apple – 40 g (chopped) · Honey – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Yogurt – 100 g",
      "Banana – 50 g (sliced)",
      "Apple – 40 g (chopped)",
      "Honey – 1 tsp"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 66,
    "slug": "greek-roman-chicken-salad",
    "name": "Greek Roman Chicken Salad",
    "description": "Grilled chicken, Cucumber, Tomato, and more.",
    "longDescription": "Grilled chicken – 120 g · Cucumber – 40 g · Tomato – 40 g · Olives – 20 g · Feta cheese – 20 g · Olive oil – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 19500,
    "kitchen": "mediterranean",
    "category": "salads",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 26,
      "carbs": 12,
      "fat": 18,
      "fiber": 6,
      "calories": 320
    },
    "ingredients": [
      "Grilled chicken – 120 g",
      "Cucumber – 40 g",
      "Tomato – 40 g",
      "Olives – 20 g",
      "Feta cheese – 20 g",
      "Olive oil – 1 tbsp",
      "Lemon juice – 1 tbsp"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 67,
    "slug": "greek-roman-veg-salad",
    "name": "Greek Roman Veg Salad",
    "description": "Cucumber, Tomato, Onion, and more.",
    "longDescription": "Cucumber – 40 g · Tomato – 40 g · Onion – 30 g · Olives – 20 g · Feta cheese – 20 g · Olive oil – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 11500,
    "kitchen": "mediterranean",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 18,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Cucumber – 40 g",
      "Tomato – 40 g",
      "Onion – 30 g",
      "Olives – 20 g",
      "Feta cheese – 20 g",
      "Olive oil – 1 tbsp",
      "Lemon juice – 1 tbsp"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 68,
    "slug": "healthy-liver-juice",
    "name": "Healthy Liver Juice",
    "description": "Beetroot, Carrot, Apple, and more.",
    "longDescription": "Beetroot – 80 g · Carrot – 80 g · Apple – 50 g · Lemon juice – ½ tbsp · Ginger – ½ inch · Water – 150 ml",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 5000,
    "kitchen": "indian",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Beetroot – 80 g",
      "Carrot – 80 g",
      "Apple – 50 g",
      "Lemon juice – ½ tbsp",
      "Ginger – ½ inch",
      "Water – 150 ml"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 69,
    "slug": "healthy-whole-wheat-tofu-wrap",
    "name": "Healthy Whole Wheat Tofu Wrap",
    "description": "Whole wheat tortilla, Tofu, Lettuce, and more.",
    "longDescription": "Whole wheat tortilla – 1 · Tofu – 100 g (grilled) · Lettuce – 20 g · Bell peppers & onion – 50 g · Yogurt dressing – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 14500,
    "kitchen": "continental",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Whole wheat tortilla – 1",
      "Tofu – 100 g (grilled)",
      "Lettuce – 20 g",
      "Bell peppers & onion – 50 g",
      "Yogurt dressing – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten",
      "Soy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 70,
    "slug": "healthy-whole-wheat-chicken-tikka-wrap",
    "name": "Healthy Whole Wheat Chicken Tikka Wrap",
    "description": "Whole wheat tortilla, Chicken tikka, Onion rings, and more.",
    "longDescription": "Whole wheat tortilla – 1 · Chicken tikka – 120 g · Onion rings – 20 g · Lettuce – 20 g · Ranch yogurt/mint chutney – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 15500,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 460
    },
    "ingredients": [
      "Whole wheat tortilla – 1",
      "Chicken tikka – 120 g",
      "Onion rings – 20 g",
      "Lettuce – 20 g",
      "Ranch yogurt/mint chutney – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 71,
    "slug": "healthy-whole-wheat-paneer-wrap",
    "name": "Healthy Whole Wheat Paneer Wrap",
    "description": "Whole wheat tortilla, Paneer tikka, Onion rings, and more.",
    "longDescription": "Whole wheat tortilla – 1 · Paneer tikka – 120 g · Onion rings – 20 g · Lettuce – 20 g · Mint chutney – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 15500,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 18,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Whole wheat tortilla – 1",
      "Paneer tikka – 120 g",
      "Onion rings – 20 g",
      "Lettuce – 20 g",
      "Mint chutney – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 72,
    "slug": "high-protein-chicken-omelette",
    "name": "High Protein Chicken Omelette",
    "description": "Eggs, Grilled chicken, Onion, and more.",
    "longDescription": "Eggs – 3 · Grilled chicken – 80 g (shredded) · Onion – 20 g · Tomato – 20 g · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 12500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 3",
      "Grilled chicken – 80 g (shredded)",
      "Onion – 20 g",
      "Tomato – 20 g",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 73,
    "slug": "hot-n-sour-soup-veg",
    "name": "Hot n Sour Soup (Veg)",
    "description": "Mixed veggies (cabbage, carrot, beans), Garlic, Soy sauce, and more.",
    "longDescription": "Mixed veggies (cabbage, carrot, beans) – 80 g · Garlic – 5 g (chopped) · Soy sauce – 1 tsp · Vinegar – 1 tsp · Cornstarch slurry – 1 tbsp · Chili paste – ½ tsp",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 9500,
    "kitchen": "asian",
    "category": "soups",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 6,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Mixed veggies (cabbage, carrot, beans) – 80 g",
      "Garlic – 5 g (chopped)",
      "Soy sauce – 1 tsp",
      "Vinegar – 1 tsp",
      "Cornstarch slurry – 1 tbsp",
      "Chili paste – ½ tsp",
      "Veg stock – 200 ml",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Soy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 74,
    "slug": "hot-n-sour-soup-chicken",
    "name": "Hot n Sour Soup (Chicken)",
    "description": "Chicken, Garlic, Soy sauce, and more.",
    "longDescription": "Chicken – 100 g (shredded, boiled) · Garlic – 5 g · Soy sauce – 1 tsp · Vinegar – 1 tsp · Chili paste – ½ tsp · Cornstarch slurry – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 9500,
    "kitchen": "asian",
    "category": "soups",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 6,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Chicken – 100 g (shredded, boiled)",
      "Garlic – 5 g",
      "Soy sauce – 1 tsp",
      "Vinegar – 1 tsp",
      "Chili paste – ½ tsp",
      "Cornstarch slurry – 1 tbsp",
      "Chicken stock – 200 ml",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Soy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 75,
    "slug": "hummus-pita-classic",
    "name": "Hummus Pita Classic",
    "description": "Pita bread, Hummus, Olive oil, and more.",
    "longDescription": "Pita bread – 1 · Hummus – 3 tbsp · Olive oil – 1 tsp · Paprika – a pinch",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 5000,
    "kitchen": "mediterranean",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Pita bread – 1",
      "Hummus – 3 tbsp",
      "Olive oil – 1 tsp",
      "Paprika – a pinch"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 76,
    "slug": "hummus-pita-with-falafel",
    "name": "Hummus Pita with Falafel",
    "description": "Pita bread, Falafel, Hummus, and more.",
    "longDescription": "Pita bread – 1 · Falafel – 3 pcs · Hummus – 3 tbsp · Onion & tomato slices – 40 g",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 14500,
    "kitchen": "mediterranean",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Pita bread – 1",
      "Falafel – 3 pcs",
      "Hummus – 3 tbsp",
      "Onion & tomato slices – 40 g"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 77,
    "slug": "hydrating-watermelon-juice",
    "name": "Hydrating Watermelon Juice",
    "description": "Watermelon cubes, Lemon juice, Mint leaves, and more.",
    "longDescription": "Watermelon cubes – 200 g · Lemon juice – ½ tbsp · Mint leaves – 4–5 · Ice cubes – 3–4",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 5000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Watermelon cubes – 200 g",
      "Lemon juice – ½ tbsp",
      "Mint leaves – 4–5",
      "Ice cubes – 3–4"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 78,
    "slug": "lebanese-hummus-salad",
    "name": "Lebanese Hummus Salad",
    "description": "Hummus, Chickpeas, Tomato, and more.",
    "longDescription": "Hummus – 3 tbsp · Chickpeas – 50 g (boiled) · Tomato – 40 g (diced) · Cucumber – 40 g (diced) · Olive oil – 1 tbsp · Lemon juice – ½ tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 6000,
    "kitchen": "mediterranean",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Hummus – 3 tbsp",
      "Chickpeas – 50 g (boiled)",
      "Tomato – 40 g (diced)",
      "Cucumber – 40 g (diced)",
      "Olive oil – 1 tbsp",
      "Lemon juice – ½ tbsp"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 79,
    "slug": "lemon-mint-ice-tea-smoothie",
    "name": "Lemon Mint Ice Tea Smoothie",
    "description": "Green tea (brewed & cooled), Lemon juice, Fresh mint, and more.",
    "longDescription": "Green tea (brewed & cooled) – 200 ml · Lemon juice – 1 tbsp · Fresh mint – 6–7 leaves · Honey – 1 tsp · Ice cubes – 4–5",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Green tea (brewed & cooled) – 200 ml",
      "Lemon juice – 1 tbsp",
      "Fresh mint – 6–7 leaves",
      "Honey – 1 tsp",
      "Ice cubes – 4–5"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 80,
    "slug": "manchow-soup-veg",
    "name": "Manchow Soup (Veg)",
    "description": "Mixed veggies (cabbage, carrot, beans), Garlic, Ginger, and more.",
    "longDescription": "Mixed veggies (cabbage, carrot, beans) – 80 g · Garlic – 5 g · Ginger – 5 g · Soy sauce – 1 tsp · Vinegar – 1 tsp · Chili paste – ½ tsp",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 9500,
    "kitchen": "asian",
    "category": "soups",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 6,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Mixed veggies (cabbage, carrot, beans) – 80 g",
      "Garlic – 5 g",
      "Ginger – 5 g",
      "Soy sauce – 1 tsp",
      "Vinegar – 1 tsp",
      "Chili paste – ½ tsp",
      "Cornstarch slurry – 1 tbsp",
      "Veg stock – 200 ml",
      "Fried noodles – 20 g (for garnish)"
    ],
    "allergens": [
      "Gluten",
      "Soy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 81,
    "slug": "manchow-soup-chicken",
    "name": "Manchow Soup (Chicken)",
    "description": "Chicken breast, Garlic, Ginger, and more.",
    "longDescription": "Chicken breast – 100 g (shredded, boiled) · Garlic – 5 g · Ginger – 5 g · Soy sauce – 1 tsp · Vinegar – 1 tsp · Chili paste – ½ tsp",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 9500,
    "kitchen": "asian",
    "category": "soups",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 6,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Chicken breast – 100 g (shredded, boiled)",
      "Garlic – 5 g",
      "Ginger – 5 g",
      "Soy sauce – 1 tsp",
      "Vinegar – 1 tsp",
      "Chili paste – ½ tsp",
      "Cornstarch slurry – 1 tbsp",
      "Chicken stock – 200 ml",
      "Fried noodles – 20 g"
    ],
    "allergens": [
      "Gluten",
      "Soy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 82,
    "slug": "masala-bread-omelette-2-egg",
    "name": "Masala Bread Omelette (2 Egg)",
    "description": "Eggs, Onion, Tomato, and more.",
    "longDescription": "Eggs – 2 · Onion – 20 g (chopped) · Tomato – 20 g (chopped) · Green chili – 1 · Coriander leaves – 1 tsp · Bread slices – 2",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Onion – 20 g (chopped)",
      "Tomato – 20 g (chopped)",
      "Green chili – 1",
      "Coriander leaves – 1 tsp",
      "Bread slices – 2",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 83,
    "slug": "millets-bread-loaf",
    "name": "Millets Bread Loaf",
    "description": "Millet flour, Whole wheat flour, Dry yeast, and more.",
    "longDescription": "Millet flour – 200 g · Whole wheat flour – 50 g · Dry yeast – 1 tsp · Warm water – 120 ml · Olive oil – 1 tbsp · Salt – ½ tsp",
    "image": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80",
    "price": 11000,
    "kitchen": "indian",
    "category": "snacks",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 6,
      "carbs": 30,
      "fat": 10,
      "fiber": 3,
      "calories": 240
    },
    "ingredients": [
      "Millet flour – 200 g",
      "Whole wheat flour – 50 g",
      "Dry yeast – 1 tsp",
      "Warm water – 120 ml",
      "Olive oil – 1 tbsp",
      "Salt – ½ tsp"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 84,
    "slug": "millets-poha-barnyard",
    "name": "Millets Poha Barnyard",
    "description": "Barnyard millet poha, Onion, Tomato, and more.",
    "longDescription": "Barnyard millet poha – 100 g · Onion – 30 g · Tomato – 30 g · Green chili – 1 · Curry leaves – 6–7 · Mustard seeds – ½ tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "indian",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Barnyard millet poha – 100 g",
      "Onion – 30 g",
      "Tomato – 30 g",
      "Green chili – 1",
      "Curry leaves – 6–7",
      "Mustard seeds – ½ tsp",
      "Oil – 1 tsp",
      "Salt – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 85,
    "slug": "moong-dal-chilla-with-curd",
    "name": "Moong Dal Chilla with Curd",
    "description": "Moong dal, Ginger, Green chili, and more.",
    "longDescription": "Moong dal – 1 cup (soaked, ground) · Ginger – 1 tsp · Green chili – 1 · Salt – to taste · Oil – 1 tsp (for cooking) · Curd – 100 g (on side)",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8500,
    "kitchen": "indian",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Moong dal – 1 cup (soaked, ground)",
      "Ginger – 1 tsp",
      "Green chili – 1",
      "Salt – to taste",
      "Oil – 1 tsp (for cooking)",
      "Curd – 100 g (on side)"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 86,
    "slug": "mushroom-omelette",
    "name": "Mushroom Omelette",
    "description": "Eggs, Mushrooms, Onion, and more.",
    "longDescription": "Eggs – 2 · Mushrooms – 50 g (sliced) · Onion – 20 g (chopped) · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 9500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Mushrooms – 50 g (sliced)",
      "Onion – 20 g (chopped)",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 87,
    "slug": "nutella-toast-white-bread",
    "name": "Nutella Toast - White Bread",
    "description": "White bread, Nutella.",
    "longDescription": "White bread – 2 slices · Nutella – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "White bread – 2 slices",
      "Nutella – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 88,
    "slug": "nutella-toast-brown-bread",
    "name": "Nutella Toast - Brown Bread",
    "description": "Brown bread, Nutella.",
    "longDescription": "Brown bread – 2 slices · Nutella – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Brown bread – 2 slices",
      "Nutella – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 89,
    "slug": "paneer-tikka-burrito-wrap",
    "name": "Paneer Tikka Burrito Wrap",
    "description": "Tortilla, Paneer tikka, Onion rings, and more.",
    "longDescription": "Tortilla – 1 · Paneer tikka – 120 g · Onion rings – 30 g · Lettuce – 20 g · Mint chutney – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 17000,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 18,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Tortilla – 1",
      "Paneer tikka – 120 g",
      "Onion rings – 30 g",
      "Lettuce – 20 g",
      "Mint chutney – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 90,
    "slug": "peanut-butter-banana-smoothie",
    "name": "Peanut Butter Banana Smoothie",
    "description": "Banana, Peanut butter, Almond milk, and more.",
    "longDescription": "Banana – 1 medium · Peanut butter – 2 tbsp · Almond milk – 200 ml · Honey – 1 tsp · Ice cubes – 4",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Banana – 1 medium",
      "Peanut butter – 2 tbsp",
      "Almond milk – 200 ml",
      "Honey – 1 tsp",
      "Ice cubes – 4"
    ],
    "allergens": [
      "Dairy",
      "Peanuts",
      "Tree Nuts"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 91,
    "slug": "peri-peri-paneer-burrito-wrap",
    "name": "Peri Peri Paneer Burrito Wrap",
    "description": "Tortilla, Paneer, Lettuce, and more.",
    "longDescription": "Tortilla – 1 large · Paneer – 120 g (grilled, peri peri spiced) · Lettuce – 20 g · Onion & capsicum – 40 g · Peri peri mayo – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 17000,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 18,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Tortilla – 1 large",
      "Paneer – 120 g (grilled, peri peri spiced)",
      "Lettuce – 20 g",
      "Onion & capsicum – 40 g",
      "Peri peri mayo – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 92,
    "slug": "peri-peri-paneer-fiesta-rice-bowl",
    "name": "Peri Peri Paneer Fiesta Rice Bowl",
    "description": "Brown rice, Paneer, Steamed veggies, and more.",
    "longDescription": "Brown rice – 150 g · Paneer – 120 g (peri peri grilled) · Steamed veggies – 70 g · Peri peri sauce – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
    "price": 16500,
    "kitchen": "indian",
    "category": "bowls",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 22,
      "carbs": 60,
      "fat": 18,
      "fiber": 7,
      "calories": 460
    },
    "ingredients": [
      "Brown rice – 150 g",
      "Paneer – 120 g (peri peri grilled)",
      "Steamed veggies – 70 g",
      "Peri peri sauce – 2 tbsp"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 93,
    "slug": "pesto-pasta-veg",
    "name": "Pesto Pasta (Veg)",
    "description": "Pasta, Basil pesto, Olive oil, and more.",
    "longDescription": "Pasta – 120 g (boiled) · Basil pesto – 2 tbsp · Olive oil – 1 tbsp · Zucchini, broccoli, capsicum – 70 g · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 16000,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 14,
      "carbs": 65,
      "fat": 18,
      "fiber": 5,
      "calories": 480
    },
    "ingredients": [
      "Pasta – 120 g (boiled)",
      "Basil pesto – 2 tbsp",
      "Olive oil – 1 tbsp",
      "Zucchini, broccoli, capsicum – 70 g",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 94,
    "slug": "pesto-pasta-chicken",
    "name": "Pesto Pasta (Chicken)",
    "description": "Pasta, Basil pesto, Olive oil, and more.",
    "longDescription": "Pasta – 120 g (boiled) · Basil pesto – 2 tbsp · Olive oil – 1 tbsp · Grilled chicken – 100 g (sliced) · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 20500,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 18,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Pasta – 120 g (boiled)",
      "Basil pesto – 2 tbsp",
      "Olive oil – 1 tbsp",
      "Grilled chicken – 100 g (sliced)",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 95,
    "slug": "pesto-pasta-prawns",
    "name": "Pesto Pasta (Prawns)",
    "description": "Pasta, Basil pesto, Olive oil, and more.",
    "longDescription": "Pasta – 120 g (boiled) · Basil pesto – 2 tbsp · Olive oil – 1 tbsp · Prawns – 6–8 (cleaned) · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&q=80",
    "price": 23000,
    "kitchen": "continental",
    "category": "pasta",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 28,
      "carbs": 65,
      "fat": 18,
      "fiber": 5,
      "calories": 580
    },
    "ingredients": [
      "Pasta – 120 g (boiled)",
      "Basil pesto – 2 tbsp",
      "Olive oil – 1 tbsp",
      "Prawns – 6–8 (cleaned)",
      "Salt & pepper – to taste"
    ],
    "allergens": [
      "Gluten",
      "Shellfish"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 96,
    "slug": "plain-omelette",
    "name": "Plain Omelette",
    "description": "Eggs, Salt & pepper, Oil.",
    "longDescription": "Eggs – 2 · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 97,
    "slug": "power-house-smoothie",
    "name": "Power House Smoothie",
    "description": "Banana, Oats, Almonds, and more.",
    "longDescription": "Banana – 1 medium · Oats – 2 tbsp (soaked) · Almonds – 6 pcs (soaked) · Peanut butter – 1 tbsp · Whey protein – 1 scoop · Almond milk – 200 ml",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 15,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Banana – 1 medium",
      "Oats – 2 tbsp (soaked)",
      "Almonds – 6 pcs (soaked)",
      "Peanut butter – 1 tbsp",
      "Whey protein – 1 scoop",
      "Almond milk – 200 ml",
      "Ice cubes – 4"
    ],
    "allergens": [
      "Dairy",
      "Peanuts",
      "Tree Nuts"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 98,
    "slug": "quinoa-khichdi",
    "name": "Quinoa Khichdi",
    "description": "Quinoa, Moong dal, Onion, and more.",
    "longDescription": "Quinoa – 80 g (washed) · Moong dal – 40 g (washed) · Onion – 30 g (chopped) · Tomato – 30 g (chopped) · Ginger – 1 tsp (grated) · Green chili – 1",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 7000,
    "kitchen": "indian",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Quinoa – 80 g (washed)",
      "Moong dal – 40 g (washed)",
      "Onion – 30 g (chopped)",
      "Tomato – 30 g (chopped)",
      "Ginger – 1 tsp (grated)",
      "Green chili – 1",
      "Curry leaves – 6–8",
      "Mustard seeds – ½ tsp",
      "Turmeric – ¼ tsp",
      "Salt – to taste",
      "Oil – 1 tsp",
      "Water – 300 ml"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 99,
    "slug": "quinoa-upma",
    "name": "Quinoa Upma",
    "description": "Quinoa, Onion, Tomato, and more.",
    "longDescription": "Quinoa – 80 g · Onion – 30 g · Tomato – 30 g · Green chili – 1 · Carrot & beans – 50 g (chopped) · Curry leaves – 6–8",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 7500,
    "kitchen": "indian",
    "category": "breakfast",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 12,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 260
    },
    "ingredients": [
      "Quinoa – 80 g",
      "Onion – 30 g",
      "Tomato – 30 g",
      "Green chili – 1",
      "Carrot & beans – 50 g (chopped)",
      "Curry leaves – 6–8",
      "Mustard seeds – ½ tsp",
      "Oil – 1 tsp",
      "Salt – to taste",
      "Water – 250 ml"
    ],
    "allergens": [],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 100,
    "slug": "ragi-dates-eggless-brownie",
    "name": "Ragi Dates Eggless Brownie",
    "description": "Ragi flour, Whole wheat flour, Dates puree, and more.",
    "longDescription": "Ragi flour – 80 g · Whole wheat flour – 20 g · Dates puree – 50 g · Cocoa powder – 15 g · Baking powder – ½ tsp · Olive oil – 20 ml",
    "image": "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80",
    "price": 11000,
    "kitchen": "indian",
    "category": "snacks",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 6,
      "carbs": 30,
      "fat": 10,
      "fiber": 3,
      "calories": 240
    },
    "ingredients": [
      "Ragi flour – 80 g",
      "Whole wheat flour – 20 g",
      "Dates puree – 50 g",
      "Cocoa powder – 15 g",
      "Baking powder – ½ tsp",
      "Olive oil – 20 ml",
      "Milk – 60 ml"
    ],
    "allergens": [
      "Eggs",
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "high",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 101,
    "slug": "roast-chicken-russian",
    "name": "Roast Chicken Russian",
    "description": "Chicken breast, Onion, Capsicum, and more.",
    "longDescription": "Chicken breast – 150 g (roasted & sliced) · Onion – 30 g · Capsicum – 30 g · Carrot – 30 g · Ranch/mayo – 1 tbsp · Lettuce – 20 g",
    "image": "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=800&q=80",
    "price": 14000,
    "kitchen": "continental",
    "category": "mains",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 36,
      "carbs": 30,
      "fat": 14,
      "fiber": 5,
      "calories": 460
    },
    "ingredients": [
      "Chicken breast – 150 g (roasted & sliced)",
      "Onion – 30 g",
      "Capsicum – 30 g",
      "Carrot – 30 g",
      "Ranch/mayo – 1 tbsp",
      "Lettuce – 20 g"
    ],
    "allergens": [
      "Dairy"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 102,
    "slug": "signature-quinoa-salad",
    "name": "Signature Quinoa Salad",
    "description": "Quinoa, Lettuce, Cucumber, and more.",
    "longDescription": "Quinoa – 80 g (cooked) · Lettuce – 40 g · Cucumber – 40 g · Tomato – 40 g · Pomegranate – 30 g · Olive oil – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 9000,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Quinoa – 80 g (cooked)",
      "Lettuce – 40 g",
      "Cucumber – 40 g",
      "Tomato – 40 g",
      "Pomegranate – 30 g",
      "Olive oil – 1 tbsp",
      "Lemon juice – ½ tbsp",
      "Salt & pepper – to taste"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 103,
    "slug": "smoked-chicken-cheese-omelette",
    "name": "Smoked Chicken Cheese Omelette",
    "description": "Eggs, Smoked chicken, Cheese, and more.",
    "longDescription": "Eggs – 3 · Smoked chicken – 80 g (sliced) · Cheese – 20 g (grated) · Onion – 20 g (chopped) · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 17500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 18,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 3",
      "Smoked chicken – 80 g (sliced)",
      "Cheese – 20 g (grated)",
      "Onion – 20 g (chopped)",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs",
      "Dairy"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 104,
    "slug": "smokey-chicken-salad",
    "name": "Smokey Chicken Salad",
    "description": "Smoked chicken, Lettuce, Cucumber, and more.",
    "longDescription": "Smoked chicken – 120 g (sliced) · Lettuce – 50 g · Cucumber – 40 g · Tomato – 40 g · Onion – 30 g · Olive oil – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 13500,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 26,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 320
    },
    "ingredients": [
      "Smoked chicken – 120 g (sliced)",
      "Lettuce – 50 g",
      "Cucumber – 40 g",
      "Tomato – 40 g",
      "Onion – 30 g",
      "Olive oil – 1 tbsp",
      "Lemon juice – 1 tbsp"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 105,
    "slug": "spinach-mushroom-omelette",
    "name": "Spinach Mushroom Omelette",
    "description": "Eggs, Spinach, Mushrooms, and more.",
    "longDescription": "Eggs – 3 · Spinach – 30 g (chopped) · Mushrooms – 40 g (sliced) · Onion – 20 g · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 10000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 3",
      "Spinach – 30 g (chopped)",
      "Mushrooms – 40 g (sliced)",
      "Onion – 20 g",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 106,
    "slug": "thums-up-can",
    "name": "Thums Up Can",
    "description": "Thums Up can.",
    "longDescription": "Thums Up can – 1 (chilled)",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Thums Up can – 1 (chilled)"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 107,
    "slug": "tomato-basil-soup",
    "name": "Tomato Basil Soup",
    "description": "Tomato, Onion, Garlic, and more.",
    "longDescription": "Tomato – 150 g (chopped) · Onion – 30 g · Garlic – 5 g · Basil – 6–7 leaves · Olive oil – 1 tsp · Salt – to taste",
    "image": "https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80",
    "price": 9500,
    "kitchen": "continental",
    "category": "soups",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 6,
      "carbs": 14,
      "fat": 6,
      "fiber": 3,
      "calories": 140
    },
    "ingredients": [
      "Tomato – 150 g (chopped)",
      "Onion – 30 g",
      "Garlic – 5 g",
      "Basil – 6–7 leaves",
      "Olive oil – 1 tsp",
      "Salt – to taste",
      "Water/veg stock – 200 ml"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 108,
    "slug": "tomato-basil-omelette",
    "name": "Tomato Basil Omelette",
    "description": "Eggs, Tomato, Basil, and more.",
    "longDescription": "Eggs – 2 · Tomato – 40 g (chopped) · Basil – 4 leaves (chopped) · Salt & pepper – to taste · Oil – 1 tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Tomato – 40 g (chopped)",
      "Basil – 4 leaves (chopped)",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 109,
    "slug": "two-boiled-eggs",
    "name": "Two Boiled Eggs",
    "description": "Eggs, Water, Salt.",
    "longDescription": "Eggs – 2 · Water – 300 ml · Salt – ¼ tsp",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 5500,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Water – 300 ml",
      "Salt – ¼ tsp"
    ],
    "allergens": [
      "Eggs"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 110,
    "slug": "veg-amigos-sandwich",
    "name": "Veg Amigos Sandwich",
    "description": "Multigrain bread, Lettuce, Tomato, and more.",
    "longDescription": "Multigrain bread – 2 slices · Lettuce – 20 g · Tomato – 30 g · Cucumber – 30 g · Onion – 20 g · Mayo/yogurt dip – 1 tbsp",
    "image": "https://images.unsplash.com/photo-1550507992-eb63ffee0847?w=800&q=80",
    "price": 14500,
    "kitchen": "indian",
    "category": "wraps",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 16,
      "carbs": 45,
      "fat": 14,
      "fiber": 6,
      "calories": 380
    },
    "ingredients": [
      "Multigrain bread – 2 slices",
      "Lettuce – 20 g",
      "Tomato – 30 g",
      "Cucumber – 30 g",
      "Onion – 20 g",
      "Mayo/yogurt dip – 1 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 111,
    "slug": "veg-caesar-story-salad",
    "name": "Veg Caesar Story Salad",
    "description": "Romaine lettuce, Croutons, Parmesan, and more.",
    "longDescription": "Romaine lettuce – 80 g · Croutons – 20 g · Parmesan – 15 g (shaved) · Caesar dressing – 2 tbsp",
    "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    "price": 13000,
    "kitchen": "continental",
    "category": "salads",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "10 min",
    "macros": {
      "protein": 12,
      "carbs": 12,
      "fat": 14,
      "fiber": 6,
      "calories": 220
    },
    "ingredients": [
      "Romaine lettuce – 80 g",
      "Croutons – 20 g",
      "Parmesan – 15 g (shaved)",
      "Caesar dressing – 2 tbsp"
    ],
    "allergens": [
      "Dairy",
      "Gluten"
    ],
    "glycaemicIndex": "low",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 112,
    "slug": "veg-loaded-bread-omelette-2-egg",
    "name": "Veg Loaded Bread Omelette (2 Egg)",
    "description": "Eggs, Onion, Tomato, and more.",
    "longDescription": "Eggs – 2 · Onion – 20 g · Tomato – 20 g · Capsicum – 20 g · Bread slices – 2 · Salt & pepper – to taste",
    "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=800&q=80",
    "price": 8000,
    "kitchen": "continental",
    "category": "breakfast",
    "isVeg": false,
    "rdVerified": true,
    "prepTime": "15-20 min",
    "macros": {
      "protein": 20,
      "carbs": 22,
      "fat": 14,
      "fiber": 3,
      "calories": 340
    },
    "ingredients": [
      "Eggs – 2",
      "Onion – 20 g",
      "Tomato – 20 g",
      "Capsicum – 20 g",
      "Bread slices – 2",
      "Salt & pepper – to taste",
      "Oil – 1 tsp"
    ],
    "allergens": [
      "Eggs",
      "Gluten"
    ],
    "glycaemicIndex": "medium",
    "sugarPerServing": "4g",
    "customizations": [],
    "isAvailable": true
  },
  {
    "id": 113,
    "slug": "zero-calorie-mint-mojito",
    "name": "Zero Calorie Mint Mojito",
    "description": "Soda water, Lemon juice, Mint leaves, and more.",
    "longDescription": "Soda water – 200 ml · Lemon juice – 1 tbsp · Mint leaves – 6–7 · Stevia/sugar-free – 1 sachet · Ice cubes – 4",
    "image": "https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=800&q=80",
    "price": 7500,
    "kitchen": "continental",
    "category": "beverages",
    "isVeg": true,
    "rdVerified": true,
    "prepTime": "5 min",
    "macros": {
      "protein": 3,
      "carbs": 22,
      "fat": 4,
      "fiber": 2,
      "calories": 140
    },
    "ingredients": [
      "Soda water – 200 ml",
      "Lemon juice – 1 tbsp",
      "Mint leaves – 6–7",
      "Stevia/sugar-free – 1 sachet",
      "Ice cubes – 4"
    ],
    "allergens": [],
    "glycaemicIndex": "low",
    "sugarPerServing": "8g (natural)",
    "customizations": [],
    "isAvailable": true
  }
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
  
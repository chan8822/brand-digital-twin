import type { DishKitchen, DishData } from "@workspace/menu-catalog";
import { DISHES } from "@workspace/menu-catalog";
import type { Lifestyle } from "./dishEnrichment";

export type TeamRole = "chef" | "rd";

export interface TeamMember {
  slug: string;
  name: string;
  role: TeamRole;
  title: string;
  credentials: string[];
  bio: string;
  yearsExperience: number;
  signatureLine: string;
  kitchens?: DishKitchen[];
  lifestyles?: Exclude<Lifestyle, "all">[];
  ownedDishSlugs?: string[];
  initials: string;
  accent: "gold" | "sage" | "blue";
}

export const TEAM: TeamMember[] = [
  {
    slug: "chef-arjun-kapoor",
    name: "Arjun Kapoor",
    role: "chef",
    title: "Head Chef — Continental",
    credentials: ["Le Cordon Bleu, Paris", "Ex-Sous Chef, The Oberoi"],
    bio: "Arjun trained in classical French technique before moving back to India to lead our continental kitchen. He insists on cold-pressed oils, oven-roasted finishes over deep-frying, and breakfast recipes that hold their macro split even after delivery.",
    yearsExperience: 14,
    signatureLine: "Breakfast and wraps that travel well without losing their crunch.",
    kitchens: ["continental"],
    initials: "AK",
    accent: "gold",
  },
  {
    slug: "chef-mei-lin-tan",
    name: "Mei Lin Tan",
    role: "chef",
    title: "Head Chef — Asian",
    credentials: ["At-Sunrice GlobalChef Academy, Singapore", "Pan-Asian residency, Bangkok"],
    bio: "Mei Lin runs the Asian kitchen with a focus on bowls and broths. She blooms her own spice pastes, controls sodium with citrus and aromatics, and treats every grain base as the structural anchor of the dish.",
    yearsExperience: 11,
    signatureLine: "Bowls where every grain is rested for fluff before plating.",
    kitchens: ["asian"],
    initials: "MT",
    accent: "gold",
  },
  {
    slug: "chef-priya-iyer",
    name: "Priya Iyer",
    role: "chef",
    title: "Head Chef — Indian",
    credentials: ["IHM Mumbai", "Bawarchi mentorship, Hyderabad"],
    bio: "Priya leads our Indian kitchen with a respect for regional technique. Spice base bloomed in a separate pan, salt added post-tasting, and proteins finished sous-vide-style to retain moisture without extra fat.",
    yearsExperience: 16,
    signatureLine: "Restaurant-style mains, without the salt and oil load.",
    kitchens: ["indian"],
    initials: "PI",
    accent: "gold",
  },
  {
    slug: "chef-marco-bianchi",
    name: "Marco Bianchi",
    role: "chef",
    title: "Head Chef — Mediterranean",
    credentials: ["ALMA, Italian Culinary School", "Olive-oil sommelier (ONAOO)"],
    bio: "Marco oversees Mediterranean — salads, soups, light pasta. He triple-washes greens within the hour of plating and emulsifies dressings in-house. Every soup is slow-simmered for ninety minutes from a vegetable or bone broth base.",
    yearsExperience: 18,
    signatureLine: "Salads spun within the hour, dressings emulsified by hand.",
    kitchens: ["mediterranean"],
    initials: "MB",
    accent: "gold",
  },
  {
    slug: "rd-anjali-nair",
    name: "Dr. Anjali Nair",
    role: "rd",
    title: "Lead RD — Cardiometabolic",
    credentials: ["PhD Clinical Nutrition, AIIMS", "Registered Dietitian (IDA)", "ADA Diabetes Educator"],
    bio: "Dr. Anjali designs our heart-healthy and diabetes-management protocols. She reviews every dish for sodium load, glycaemic index, and saturated-fat ratio, and signs off the daily macro targets used across the app.",
    yearsExperience: 17,
    signatureLine: "Every plate signed off for sodium, GI, and saturated-fat ratio.",
    lifestyles: ["heart-healthy", "diabetes-management"],
    initials: "AN",
    accent: "sage",
  },
  {
    slug: "rd-vikram-sethi",
    name: "Dr. Vikram Sethi",
    role: "rd",
    title: "Performance RD",
    credentials: ["MSc Sports Nutrition, Loughborough", "ISAK Level 2 Anthropometrist", "CSCS"],
    bio: "Vikram owns the fitness-gains protocol. He sets protein floors per category, designs our high-protein bowls, and writes the post-workout recovery notes you see on dishes flagged for muscle-gain goals.",
    yearsExperience: 9,
    signatureLine: "Protein floors, recovery windows, and zero hidden carbs.",
    lifestyles: ["fitness-gains"],
    initials: "VS",
    accent: "blue",
  },
  {
    slug: "rd-kavya-menon",
    name: "Dr. Kavya Menon",
    role: "rd",
    title: "Family & Gut Health RD",
    credentials: ["MSc Nutrition & Dietetics, KMC Manipal", "Paediatric Nutrition Cert (BPNI)"],
    bio: "Kavya curates our junior-explorers and silver-vitality lines. She reviews every kid-friendly dish for hidden sugar, fibre adequacy, and digestibility, and signs off on the gentle-textured options used by our older guests.",
    yearsExperience: 12,
    signatureLine: "Gentle on the gut, friendly on the palate, honest on the label.",
    lifestyles: ["junior-explorers", "silver-vitality"],
    initials: "KM",
    accent: "sage",
  },
];

export function getTeamMemberBySlug(slug: string): TeamMember | undefined {
  return TEAM.find((m) => m.slug === slug);
}

export function getChefForDish(dish: DishData): TeamMember | undefined {
  return TEAM.find((m) => m.role === "chef" && m.kitchens?.includes(dish.kitchen));
}

export function getRdForDish(dish: DishData): TeamMember | undefined {
  const sugarNum = parseFloat(dish.sugarPerServing) || 0;
  if (dish.macros.protein >= 22) {
    return TEAM.find((m) => m.slug === "rd-vikram-sethi");
  }
  if (dish.glycaemicIndex === "low" && sugarNum <= 10 && dish.macros.fat <= 18) {
    return TEAM.find((m) => m.slug === "rd-anjali-nair");
  }
  return TEAM.find((m) => m.slug === "rd-kavya-menon");
}

export function getOwnedDishesForMember(member: TeamMember): DishData[] {
  if (member.role === "chef") {
    return DISHES.filter(
      (d) => d.isAvailable && member.kitchens?.includes(d.kitchen),
    ).slice(0, 8);
  }
  return DISHES.filter((d) => {
    if (!d.isAvailable) return false;
    const matched = getRdForDish(d);
    return matched?.slug === member.slug;
  }).slice(0, 8);
}

export const ACCENT_CLASSES: Record<TeamMember["accent"], { ring: string; text: string; bg: string; chip: string }> = {
  gold: {
    ring: "ring-clinical-gold/30",
    text: "text-clinical-gold",
    bg: "bg-clinical-gold/10",
    chip: "bg-clinical-gold/15 text-clinical-gold border-clinical-gold/30",
  },
  sage: {
    ring: "ring-clinical-sage/30",
    text: "text-clinical-sage",
    bg: "bg-clinical-sage/10",
    chip: "bg-clinical-sage/15 text-clinical-sage border-clinical-sage/30",
  },
  blue: {
    ring: "ring-clinical-blue/30",
    text: "text-clinical-blue",
    bg: "bg-clinical-blue/10",
    chip: "bg-clinical-blue/15 text-clinical-blue border-clinical-blue/30",
  },
};

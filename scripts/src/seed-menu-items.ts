import { db, menuItemsTable } from "@workspace/db";
import { DISHES } from "@workspace/menu-catalog";
import { sql } from "drizzle-orm";

async function main() {
  console.log(`Seeding ${DISHES.length} dishes into menu_items...`);

  let inserted = 0;
  let updated = 0;

  for (const d of DISHES) {
    const values = {
      slug: d.slug,
      name: d.name,
      description: d.description,
      pricePaise: d.price,
      category: d.category,
      kitchenLocation: d.kitchen,
      isVeg: d.isVeg,
      isAvailable: d.isAvailable,
      imageUrl: d.image,
      longDescription: d.longDescription,
      allergens: d.allergens.length > 0 ? d.allergens : null,
      macros: {
        kcal: d.macros.calories,
        proteinG: d.macros.protein,
        carbsG: d.macros.carbs,
        fatG: d.macros.fat,
      },
      macrosAreEstimate: false,
    } as const;

    const result = await db
      .insert(menuItemsTable)
      .values(values)
      .onConflictDoUpdate({
        target: menuItemsTable.slug,
        // Refresh fields that haven't been edited in CMS. We keep editor-managed
        // fields like name/description/price as-is on conflict, and only update
        // the static-only fields (kitchen, category, isVeg) plus macros if they
        // were never set by the editor (macrosAreEstimate=true means default).
        set: {
          category: sql`excluded.category`,
          kitchenLocation: sql`excluded.kitchen_location`,
          isVeg: sql`excluded.is_veg`,
          longDescription: sql`coalesce(${menuItemsTable.longDescription}, excluded.long_description)`,
          allergens: sql`coalesce(${menuItemsTable.allergens}, excluded.allergens)`,
          imageUrl: sql`coalesce(${menuItemsTable.imageUrl}, excluded.image_url)`,
        },
      })
      .returning({ id: menuItemsTable.id, createdAt: menuItemsTable.createdAt });

    const row = result[0];
    if (!row) continue;
    // Heuristic: if createdAt is recent (within last few seconds), it was just inserted.
    if (Date.now() - new Date(row.createdAt).getTime() < 5000) {
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(`Seed complete: ${inserted} inserted, ${updated} refreshed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

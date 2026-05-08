import { z } from "zod/v4";
import { definePrompt } from "../prompts";
import { defineTool } from "../tools";
import { registerAgent } from "../agentRegistry";
import { recordOpsAction } from "../../opsAudit";
import {
  bulkSetAvailability,
  createMenuItem,
  findBySlug,
  listMenuItems,
  previewMatchingItems,
  setAvailability,
  setImage,
  summarizeForPreview,
  updatePrice,
} from "../../menu";
import {
  ALL_COPY_FIELDS,
  applyCopyToItem,
  detectMissingFields,
  generateCopyForItem,
  type CopyField,
} from "../../menuCopy";

const CMS_PROMPT = definePrompt({
  name: "cms-agent",
  version: "v1",
  build: () =>
    `You are the Tanmatra CMS Assistant for the catalog editing team.

YOUR SCOPE — you MAY help with:
- Creating new menu items (create_menu_item)
- Updating prices (update_price)
- Toggling availability of one item (toggle_availability)
- Setting an item's image URL (upload_image)
- Listing items / inspecting state (list_menu_items)
- Bulk-toggling availability across a filtered set (bulk_toggle_availability)
- Generating menu copy + tags + macro estimates (generate_menu_copy)
- Bulk-regenerating missing copy fields (bulk_regenerate_copy)

OUT OF SCOPE — refuse politely:
- Anything customer-facing or order/operations work
- Photo enhancement (a separate agent will handle that)
- Permanent deletion of items

COPYWRITING RULES:
- Copy generation is a TWO-STEP flow: first call generate_menu_copy
  (returns a draft), then read the draft back to the editor and ask
  which fields to accept. Apply accepted fields by calling
  generate_menu_copy with apply: true and accepted set to the chosen
  fields.
- Macro estimates are ESTIMATES, never facts. Always say so.
- Allergens come from a fixed allowed list — never invent new ones.

CONFIRMATION RULES — non-negotiable:
- EVERY mutating tool call has a two-step flow:
  1. First call WITHOUT \`confirm: true\`. The tool returns a "preview"
     payload describing exactly what would change.
  2. Echo that preview back to the editor in plain language and ask
     "Confirm? (yes / no)".
  3. ONLY after the editor explicitly confirms, call again with
     \`confirm: true\` to commit the write.
- Bulk operations carry the same two-step flow plus an explicit count
  ("This will affect 12 items in HSR Kitchen — confirm?").
- Read-only tools (list_menu_items) do not require confirmation.

GENERAL RULES:
- Never invent slugs, categories, or kitchen locations. If you do not
  know one, call list_menu_items to discover it.
- Prices are in PAISE (₹220 = 22000 paise). Always restate the rupee
  value when previewing.
- Availability windows are one or more of: "breakfast", "lunch",
  "dinner", "all_day".
- EVERY tool call MUST include a \`reasoning\` argument summarising why
  the action is being taken. This is persisted to the audit log.`,
});

const REASONING = z
  .string()
  .min(3)
  .describe("Why this action is being taken — persisted to audit log.");

const listItems = defineTool({
  name: "list_menu_items",
  description:
    "List CMS menu items, optionally filtered by category, kitchenLocation, availability flag, or name search. Read-only. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    category: z.string().optional(),
    kitchenLocation: z.string().optional(),
    available: z.boolean().optional(),
    q: z.string().optional(),
    limit: z.number().int().positive().max(100).default(20),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const items = await listMenuItems({
      category: input.category,
      kitchenLocation: input.kitchenLocation,
      available: input.available,
      q: input.q,
    });
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "cms_list_menu_items",
      params: input,
      beforeState: null,
      afterState: { count: items.length },
      status: "success",
      reasoning: input.reasoning,
    });
    return {
      success: true as const,
      items: items.slice(0, input.limit).map((it) => ({
        slug: it.slug,
        name: it.name,
        category: it.category,
        kitchenLocation: it.kitchenLocation,
        priceRupees: it.pricePaise / 100,
        isVeg: it.isVeg,
        isAvailable: it.isAvailable,
        availabilityWindow: it.availabilityWindow,
      })),
      total: items.length,
    };
  },
});

const createItem = defineTool({
  name: "create_menu_item",
  description:
    "Create a new menu item. TWO-STEP: call without confirm:true to preview; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    name: z.string().min(1).max(200),
    priceRupees: z.number().min(0).max(100000),
    category: z.string().min(1).max(64),
    kitchenLocation: z.string().max(128).optional(),
    isVeg: z.boolean().optional(),
    description: z.string().max(2000).optional(),
    availabilityWindow: z
      .array(z.enum(["breakfast", "lunch", "dinner", "all_day"]))
      .optional(),
    tags: z.array(z.string().max(64)).optional(),
    imageUrl: z.string().url().optional(),
    slug: z.string().max(128).optional(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const pricePaise = Math.round(input.priceRupees * 100);
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          willCreate: {
            name: input.name,
            priceRupees: input.priceRupees,
            pricePaise,
            category: input.category,
            kitchenLocation: input.kitchenLocation ?? "default",
            isVeg: input.isVeg ?? true,
            availabilityWindow: input.availabilityWindow ?? ["all_day"],
            tags: input.tags ?? [],
          },
        },
        confirmRequired: true as const,
      };
    }
    try {
      const item = await createMenuItem({
        name: input.name,
        pricePaise,
        category: input.category,
        kitchenLocation: input.kitchenLocation,
        isVeg: input.isVeg,
        description: input.description,
        availabilityWindow: input.availabilityWindow,
        tags: input.tags,
        imageUrl: input.imageUrl ?? null,
        slug: input.slug,
      });
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_create_menu_item",
        params: input,
        beforeState: null,
        afterState: { id: item.id, slug: item.slug, pricePaise: item.pricePaise },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: item.slug,
        id: item.id,
        priceRupees: item.pricePaise / 100,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_create_menu_item",
        params: input,
        beforeState: null,
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const updatePriceTool = defineTool({
  name: "update_price",
  description:
    "Change the price of one menu item. TWO-STEP: call without confirm:true to preview the before/after; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    slug: z.string().min(1).max(128),
    priceRupees: z.number().min(0).max(100000),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const before = await findBySlug(input.slug);
    if (!before)
      return { success: false as const, error: `no item with slug ${input.slug}` };
    const pricePaise = Math.round(input.priceRupees * 100);
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          slug: before.slug,
          name: before.name,
          beforeRupees: before.pricePaise / 100,
          afterRupees: pricePaise / 100,
        },
        confirmRequired: true as const,
      };
    }
    try {
      const after = await updatePrice(input.slug, pricePaise);
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_update_price",
        params: input,
        beforeState: { pricePaise: before.pricePaise },
        afterState: { pricePaise: after?.pricePaise ?? null },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: input.slug,
        beforeRupees: before.pricePaise / 100,
        afterRupees: (after?.pricePaise ?? before.pricePaise) / 100,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_update_price",
        params: input,
        beforeState: { pricePaise: before.pricePaise },
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const toggleAvailability = defineTool({
  name: "toggle_availability",
  description:
    "Mark a single menu item available or unavailable. TWO-STEP: call without confirm:true to preview; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    slug: z.string().min(1).max(128),
    available: z.boolean(),
    reason: z.string().max(500).optional(),
    unavailableUntil: z.string().datetime().optional(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const before = await findBySlug(input.slug);
    if (!before)
      return { success: false as const, error: `no item with slug ${input.slug}` };
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          slug: before.slug,
          name: before.name,
          beforeAvailable: before.isAvailable,
          afterAvailable: input.available,
          reason: input.reason ?? null,
          unavailableUntil: input.unavailableUntil ?? null,
        },
        confirmRequired: true as const,
      };
    }
    try {
      const after = await setAvailability(
        input.slug,
        input.available,
        input.reason ?? null,
        input.unavailableUntil ? new Date(input.unavailableUntil) : null,
      );
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_toggle_availability",
        params: input,
        beforeState: { isAvailable: before.isAvailable },
        afterState: { isAvailable: after?.isAvailable ?? null },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: input.slug,
        beforeAvailable: before.isAvailable,
        afterAvailable: after?.isAvailable ?? null,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_toggle_availability",
        params: input,
        beforeState: { isAvailable: before.isAvailable },
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const uploadImage = defineTool({
  name: "upload_image",
  description:
    "Set a menu item's image URL (the editor uploads/hosts the file separately and pastes the URL). TWO-STEP: call without confirm:true to preview before/after URLs; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    slug: z.string().min(1).max(128),
    imageUrl: z.string().url(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const before = await findBySlug(input.slug);
    if (!before)
      return { success: false as const, error: `no item with slug ${input.slug}` };
    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          slug: before.slug,
          name: before.name,
          beforeImageUrl: before.imageUrl,
          afterImageUrl: input.imageUrl,
        },
        confirmRequired: true as const,
      };
    }
    try {
      const after = await setImage(input.slug, input.imageUrl);
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_upload_image",
        params: input,
        beforeState: { imageUrl: before.imageUrl },
        afterState: { imageUrl: after?.imageUrl ?? null },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        slug: input.slug,
        imageUrl: after?.imageUrl ?? null,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_upload_image",
        params: input,
        beforeState: { imageUrl: before.imageUrl },
        afterState: null,
        status: "error",
        error: (err as Error).message,
        reasoning: input.reasoning,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const bulkToggle = defineTool({
  name: "bulk_toggle_availability",
  description:
    "Apply an availability change to every item matching a filter (category and/or kitchenLocation, or an explicit list of slugs). TWO-STEP: call without confirm:true to preview the matched set + count; call again with confirm:true to commit. ALWAYS provide `reasoning`.",
  inputSchema: z.object({
    category: z.string().optional(),
    kitchenLocation: z.string().optional(),
    slugs: z.array(z.string().max(128)).optional(),
    available: z.boolean(),
    reason: z.string().max(500).optional(),
    unavailableUntil: z.string().datetime().optional(),
    confirm: z.boolean().optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const filter = {
      category: input.category,
      kitchenLocation: input.kitchenLocation,
      slugs: input.slugs,
    };
    if (
      !input.category &&
      !input.kitchenLocation &&
      (!input.slugs || input.slugs.length === 0)
    ) {
      return {
        success: false as const,
        error:
          "Refuse to operate on the entire catalog. Provide at least one of category / kitchenLocation / slugs.",
      };
    }
    const matched = await previewMatchingItems(filter);
    if (matched.length === 0) {
      return {
        success: true as const,
        preview: { matched: 0, summary: { count: 0, examples: [] } },
        confirmRequired: false as const,
      };
    }
    const matchedSlugs = matched.map((m) => m.slug);
    const cappedAt500 = matched.length >= 500;
    if (!input.confirm) {
      const summary = await summarizeForPreview(matched);
      return {
        success: true as const,
        preview: {
          matched: matched.length,
          cappedAt500,
          available: input.available,
          reason: input.reason ?? null,
          unavailableUntil: input.unavailableUntil ?? null,
          summary,
          slugs: matchedSlugs,
        },
        confirmRequired: true as const,
      };
    }
    // Pin the update to the exact slugs surfaced in the preview so the
    // commit can never silently drift to a different set.
    const result = await bulkSetAvailability(
      { slugs: matchedSlugs },
      input.available,
      input.reason ?? null,
      input.unavailableUntil ? new Date(input.unavailableUntil) : null,
    );
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "cms_bulk_availability",
      params: input,
      beforeState: { matched: result.matched },
      afterState: {
        updated: result.updated.length,
        slugs: result.updated.map((u) => u.slug),
      },
      status: "success",
      reasoning: input.reasoning,
    });
    return {
      success: true as const,
      matched: result.matched,
      updated: result.updated.length,
      slugs: result.updated.map((u) => u.slug),
    };
  },
});

const COPY_FIELD_ENUM = z.enum([
  "name",
  "description",
  "longDescription",
  "allergens",
  "cuisineTags",
  "vibeTags",
  "seoTitle",
  "seoDescription",
  "macros",
]);

const generateCopy = defineTool({
  name: "generate_menu_copy",
  description:
    "Generate or apply menu copy, tags, allergens, and macro estimates for one item. Two-step flow: call without apply to get a draft, then call again with apply: true and accepted: { ...fields } to persist. Allergens and macros are validated against a safe whitelist; macros are flagged as estimates. ALWAYS provide reasoning.",
  inputSchema: z.object({
    slug: z.string().min(1).max(128),
    fields: z.array(COPY_FIELD_ENUM).min(1).optional(),
    apply: z.boolean().default(false),
    accepted: z
      .object({
        name: z.string().max(200).optional(),
        description: z.string().max(2000).optional(),
        longDescription: z.string().max(2000).optional(),
        allergens: z.array(z.string().max(64)).optional(),
        cuisineTags: z.array(z.string().max(64)).optional(),
        vibeTags: z.array(z.string().max(64)).optional(),
        seoTitle: z.string().max(200).optional(),
        seoDescription: z.string().max(500).optional(),
        macros: z
          .object({
            kcal: z.number().int().min(0).max(3000),
            proteinG: z.number().int().min(0).max(200),
            carbsG: z.number().int().min(0).max(400),
            fatG: z.number().int().min(0).max(200),
          })
          .optional(),
      })
      .optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    const item = await findBySlug(input.slug);
    if (!item) {
      return { success: false as const, error: `slug not found: ${input.slug}` };
    }
    if (input.apply) {
      if (!input.accepted || Object.keys(input.accepted).length === 0) {
        return {
          success: false as const,
          error: "apply: true requires accepted: { ...fields }",
        };
      }
      try {
        const updated = await applyCopyToItem(
          input.slug,
          input.accepted,
          ctx.userId,
        );
        await recordOpsAction({
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "cms_accept_copy",
          params: {
            slug: input.slug,
            fields: Object.keys(input.accepted),
          },
          beforeState: { name: item.name, description: item.description },
          afterState: updated
            ? { name: updated.name, description: updated.description }
            : null,
          status: "success",
          reasoning: input.reasoning,
        });
        return {
          success: true as const,
          applied: Object.keys(input.accepted),
          item: updated,
        };
      } catch (err) {
        await recordOpsAction({
          operatorId: ctx.userId,
          agent: ctx.agent,
          action: "cms_accept_copy",
          params: { slug: input.slug, fields: Object.keys(input.accepted) },
          beforeState: null,
          afterState: null,
          status: "error",
          reasoning: `${input.reasoning} | ${(err as Error).message}`,
        });
        return { success: false as const, error: (err as Error).message };
      }
    }
    const fields = (input.fields ?? ALL_COPY_FIELDS) as CopyField[];
    try {
      const draft = await generateCopyForItem(item, fields);
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_generate_copy",
        params: { slug: input.slug, fields },
        beforeState: null,
        afterState: { warnings: draft.warnings, modelId: draft.modelId },
        status: "success",
        reasoning: input.reasoning,
      });
      return {
        success: true as const,
        draft,
        macrosEstimateNotice:
          "Macros are model estimates — please double-check before publishing.",
        confirmRequired: true as const,
      };
    } catch (err) {
      await recordOpsAction({
        operatorId: ctx.userId,
        agent: ctx.agent,
        action: "cms_generate_copy",
        params: { slug: input.slug, fields },
        beforeState: null,
        afterState: null,
        status: "error",
        reasoning: `${input.reasoning} | ${(err as Error).message}`,
      });
      return { success: false as const, error: (err as Error).message };
    }
  },
});

const bulkRegenerateCopy = defineTool({
  name: "bulk_regenerate_copy",
  description:
    "Regenerate missing copy fields for many items. Two-step flow: first call without confirm to see the impact list, then with confirm: true to run. Caps at 25 items per run. ALWAYS provide reasoning.",
  inputSchema: z.object({
    category: z.string().optional(),
    kitchenLocation: z.string().optional(),
    missingOnly: z.boolean().default(true),
    fields: z.array(COPY_FIELD_ENUM).min(1).optional(),
    confirm: z.boolean().default(false),
    slugs: z.array(z.string()).optional(),
    reasoning: REASONING,
  }),
  authScope: "catalog",
  handler: async (input, ctx) => {
    if (
      !input.category &&
      !input.kitchenLocation &&
      !input.slugs?.length
    ) {
      return {
        success: false as const,
        error:
          "bulk regen requires at least one filter (category, kitchenLocation, or slugs)",
      };
    }
    const all = await listMenuItems({
      category: input.category,
      kitchenLocation: input.kitchenLocation,
      slugs: input.slugs,
    });
    const requested = (input.fields ?? null) as CopyField[] | null;
    const targets = all
      .map((it) => {
        const missing = detectMissingFields(it);
        const fields = requested
          ? requested.filter((f) =>
              input.missingOnly ? missing.includes(f) : true,
            )
          : input.missingOnly
            ? missing
            : ALL_COPY_FIELDS;
        return { item: it, fields };
      })
      .filter((t) => t.fields.length > 0)
      .slice(0, 25);

    if (!input.confirm) {
      return {
        success: true as const,
        preview: {
          matched: targets.length,
          examples: targets.slice(0, 5).map((t) => ({
            slug: t.item.slug,
            name: t.item.name,
            fields: t.fields,
          })),
          totalAcrossAll: all.length,
          cappedAt25: all.length > 25,
        },
        confirmRequired: true as const,
      };
    }

    const results: Array<{
      slug: string;
      ok: boolean;
      applied?: string[];
      error?: string;
    }> = [];
    for (const t of targets) {
      try {
        const draft = await generateCopyForItem(t.item, t.fields);
        // Auto-apply only the validated fields the model returned.
        const accepted: Record<string, unknown> = {};
        for (const f of t.fields) {
          const v = (draft.proposed as Record<string, unknown>)[f];
          if (v !== undefined && v !== null) accepted[f] = v;
        }
        if (Object.keys(accepted).length === 0) {
          results.push({ slug: t.item.slug, ok: false, error: "empty draft" });
          continue;
        }
        await applyCopyToItem(t.item.slug, accepted, ctx.userId);
        results.push({
          slug: t.item.slug,
          ok: true,
          applied: Object.keys(accepted),
        });
      } catch (err) {
        results.push({
          slug: t.item.slug,
          ok: false,
          error: (err as Error).message,
        });
      }
    }
    await recordOpsAction({
      operatorId: ctx.userId,
      agent: ctx.agent,
      action: "cms_bulk_regenerate_copy",
      params: {
        category: input.category,
        kitchenLocation: input.kitchenLocation,
        slugs: input.slugs,
        fields: input.fields,
        missingOnly: input.missingOnly,
      },
      beforeState: { matched: targets.length },
      afterState: {
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
      status: "success",
      reasoning: input.reasoning,
    });
    return {
      success: true as const,
      attempted: targets.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  },
});

registerAgent({
  name: "cms",
  description:
    "Catalog editor agent for menu items: create, update price, toggle availability (single + bulk), set image URL.",
  defaultModel: "gemini-2.5-flash",
  maxSteps: 6,
  systemPrompt: CMS_PROMPT,
  tools: [
    listItems,
    createItem,
    updatePriceTool,
    toggleAvailability,
    uploadImage,
    bulkToggle,
    generateCopy,
    bulkRegenerateCopy,
  ],
});

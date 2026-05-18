import type { LoaderFunctionArgs } from "react-router";

const BASE_URL = "https://tanmatra.food";

const STATIC_PAGES = [
  { loc: "/", changefreq: "weekly", priority: "1.0" },
  { loc: "/menu", changefreq: "daily", priority: "0.9" },
  { loc: "/wellness", changefreq: "weekly", priority: "0.8" },
  { loc: "/performance", changefreq: "weekly", priority: "0.8" },
  { loc: "/clinical", changefreq: "weekly", priority: "0.8" },
  { loc: "/team", changefreq: "monthly", priority: "0.7" },
  { loc: "/rd", changefreq: "weekly", priority: "0.7" },
  { loc: "/plans", changefreq: "weekly", priority: "0.7" },
  { loc: "/recipes", changefreq: "weekly", priority: "0.7" },
  { loc: "/challenges", changefreq: "daily", priority: "0.7" },
  { loc: "/corporate", changefreq: "monthly", priority: "0.6" },
  { loc: "/faq", changefreq: "monthly", priority: "0.6" },
  { loc: "/marketplace", changefreq: "weekly", priority: "0.6" },
  { loc: "/rd-partners", changefreq: "monthly", priority: "0.5" },
  { loc: "/terms", changefreq: "yearly", priority: "0.3" },
  { loc: "/privacy", changefreq: "yearly", priority: "0.3" },
];

function buildSitemap(
  staticPages: typeof STATIC_PAGES,
  dishes: Array<{ slug: string; updatedAt: string }>,
): string {
  const staticEntries = staticPages
    .map(
      (p) => `  <url>
    <loc>${BASE_URL}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
    )
    .join("\n");

  const dishEntries = dishes
    .map(
      (d) => `  <url>
    <loc>${BASE_URL}/dish/${d.slug}</loc>
    <lastmod>${new Date(d.updatedAt).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticEntries}
${dishEntries}
</urlset>`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Fetch live dish list from the API — dishes added/removed after deploy
  // are reflected immediately without a rebuild.
  const apiBase =
    process.env["VITE_API_BASE"] ??
    "https://wellness-foods-1076775857511.asia-south2.run.app/api";

  let dishes: Array<{ slug: string; updatedAt: string }> = [];
  try {
    const res = await fetch(`${apiBase}/menu/public`, {
      headers: { "User-Agent": "TanmatraSitemapBot/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        dishes?: Array<{ slug: string; updatedAt?: string }>;
      };
      dishes = (data.dishes ?? []).map((d) => ({
        slug: d.slug,
        updatedAt: d.updatedAt ?? new Date().toISOString(),
      }));
    }
  } catch {
    // API unreachable — serve static-only sitemap, never 500.
  }

  return new Response(buildSitemap(STATIC_PAGES, dishes), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Cache for 1 hour on the CDN; stale-while-revalidate for 24h.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

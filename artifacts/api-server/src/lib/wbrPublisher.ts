import { eq } from "drizzle-orm";
import { db, wbrReportsTable, type WbrReport } from "@workspace/db";
import { logger } from "./logger";

// Posts a weekly business review to the leadership channel. Slack incoming
// webhook is the simplest sink; if no URL is configured we still log a
// structured payload so the post-merge environment can plug something in
// later without code changes.

function pctDelta(curr: number, prev: number): string {
  if (prev <= 0) return curr > 0 ? "new" : "0%";
  const d = ((curr - prev) / prev) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
}

function rupeesShort(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `₹${rupees.toFixed(0)}`;
}

function buildSlackBlocks(report: WbrReport): unknown {
  const k = report.kpis;
  const headline = `*Weekly Business Review — week of ${new Date(report.weekStart).toLocaleDateString()}*`;
  const kpiLine =
    `Orders *${k.orders}* (${pctDelta(k.orders, k.ordersPrev)}) · ` +
    `Revenue *${rupeesShort(k.revenuePaise)}* (${pctDelta(k.revenuePaise, k.revenuePaisePrev)}) · ` +
    `Active customers *${k.activeCustomers}* (${pctDelta(k.activeCustomers, k.activeCustomersPrev)}) · ` +
    `AOV *${rupeesShort(k.avgOrderPaise)}*`;
  const top = k.topDishes.length
    ? `Top dishes: ${k.topDishes.map((d) => `${d.name} (${d.units})`).join(", ")}`
    : "Top dishes: —";
  return {
    text: `Tanmatra WBR for week of ${new Date(report.weekStart).toLocaleDateString()}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: headline } },
      { type: "section", text: { type: "mrkdwn", text: kpiLine } },
      { type: "section", text: { type: "mrkdwn", text: report.commentary } },
      { type: "context", elements: [{ type: "mrkdwn", text: top }] },
    ],
  };
}

export interface PublishResult {
  delivered: boolean;
  channel: "slack" | "log";
  alreadyPublished: boolean;
}

export async function publishWbr(
  report: WbrReport,
  opts: { force?: boolean } = {},
): Promise<PublishResult> {
  // Persistent idempotency: if this report already has a publishedAt
  // marker, do nothing unless the caller explicitly forces a re-send.
  // Survives process restarts (the previous in-memory de-dupe did not).
  if (report.publishedAt && !opts.force) {
    return { delivered: false, channel: (report.publishChannel as "slack" | "log") ?? "log", alreadyPublished: true };
  }
  const url = process.env["WBR_SLACK_WEBHOOK_URL"];
  const payload = buildSlackBlocks(report);
  let delivered = false;
  let channel: "slack" | "log" = "log";
  if (!url) {
    // Log-only fallback: do NOT mark as published. If a webhook is wired
    // up later in the same week, the next scheduler tick should still be
    // able to deliver the real Slack post.
    logger.info({ wbrId: report.id, payload }, "wbr publish: no webhook configured, log-only (not marked published)");
    return { delivered: false, channel: "log", alreadyPublished: false };
  } else {
    channel = "slack";
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error({ status: resp.status, body }, "wbr slack publish failed");
        return { delivered: false, channel: "slack", alreadyPublished: false };
      }
      delivered = true;
      logger.info({ wbrId: report.id }, "wbr published to slack");
    } catch (err) {
      logger.error({ err }, "wbr slack publish threw");
      return { delivered: false, channel: "slack", alreadyPublished: false };
    }
  }
  // Record successful delivery (or the log-only fallback) so subsequent
  // ticks in the same week skip this report.
  await db
    .update(wbrReportsTable)
    .set({ publishedAt: new Date(), publishChannel: channel })
    .where(eq(wbrReportsTable.id, report.id));
  return { delivered, channel, alreadyPublished: false };
}

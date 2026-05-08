import { logger } from "./logger";
import { buildDailyDigest, type DigestRow } from "./anomalies";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEND_HOUR_UTC = Number(process.env["ANOMALY_DIGEST_HOUR_UTC"] ?? 2);

let timer: ReturnType<typeof setTimeout> | null = null;
let lastSentDay: string | null = null;

function nextSendDelayMs(now = new Date()): number {
  const target = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      SEND_HOUR_UTC,
      0,
      0,
    ),
  );
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function severityEmoji(s: DigestRow["severity"]): string {
  if (s === "high") return ":rotating_light:";
  if (s === "medium") return ":warning:";
  return ":eyes:";
}

function buildSlackBlocks(digest: {
  windowStart: Date;
  windowEnd: Date;
  rows: DigestRow[];
  total: number;
}): unknown {
  if (digest.rows.length === 0) {
    return {
      text: `Tanmatra ops anomaly digest: 0 alerts in the last 24h. All quiet.`,
    };
  }
  const lines = digest.rows.map(
    (r) =>
      `${severityEmoji(r.severity)} *${r.metric.replace(/_/g, " ")}* — ${r.severity}, ${r.count}× — ${r.latestSummary}`,
  );
  return {
    text: `Tanmatra ops anomaly digest: ${digest.total} alerts in the last 24h`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Tanmatra ops anomaly digest* — ${digest.total} alerts in the last 24h\n${lines.join("\n")}`,
        },
      },
    ],
  };
}

export async function sendDailyDigest(): Promise<{
  delivered: boolean;
  channel: "slack" | "log";
  total: number;
}> {
  const digest = await buildDailyDigest();
  const slackUrl = process.env["ANOMALY_SLACK_WEBHOOK_URL"];
  if (slackUrl) {
    try {
      const resp = await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSlackBlocks(digest)),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        logger.error(
          { status: resp.status, body },
          "anomaly digest slack post failed",
        );
        return { delivered: false, channel: "slack", total: digest.total };
      }
      logger.info(
        { total: digest.total, rows: digest.rows.length },
        "anomaly digest posted to slack",
      );
      return { delivered: true, channel: "slack", total: digest.total };
    } catch (err) {
      logger.error({ err }, "anomaly digest slack post threw");
      return { delivered: false, channel: "slack", total: digest.total };
    }
  }
  logger.info(
    { total: digest.total, rows: digest.rows },
    "anomaly digest (no ANOMALY_SLACK_WEBHOOK_URL configured — logged only)",
  );
  return { delivered: true, channel: "log", total: digest.total };
}

async function dailyTick(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastSentDay === today) {
    schedule();
    return;
  }
  try {
    await sendDailyDigest();
    lastSentDay = today;
  } catch (err) {
    logger.error({ err }, "anomaly digest send failed");
  } finally {
    schedule();
  }
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  const delay = nextSendDelayMs();
  timer = setTimeout(() => void dailyTick(), Math.min(delay, ONE_DAY_MS));
  if (typeof timer.unref === "function") timer.unref();
}

export function startAnomalyDigestSender(): void {
  if (process.env["ANOMALY_DIGEST_DISABLED"] === "1") {
    logger.info("anomaly digest sender disabled via env");
    return;
  }
  schedule();
  logger.info(
    { sendHourUtc: SEND_HOUR_UTC },
    "anomaly digest sender scheduled",
  );
}

export function stopAnomalyDigestSender(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

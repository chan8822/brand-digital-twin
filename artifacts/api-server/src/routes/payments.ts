import * as crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

/** Returns [keyId, keySecret] or null when either env var is absent. */
function razorpayCredentials(): [string, string] | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return [keyId, keySecret];
}

function razorpayBasicAuth(keyId: string, keySecret: string): string {
  return Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

// ---------------------------------------------------------------------------
// Schema definitions
// ---------------------------------------------------------------------------

const createRazorpayOrderSchema = z.object({
  amountPaise: z.number().int().positive().max(10_000_000),
  receipt: z.string().max(40).optional(),
});

const verifyPaymentSchema = z.object({
  orderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpayOrderId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(128),
});

const upiIntentSchema = z.object({
  amountPaise: z.number().int().positive(),
  orderId: z.string().max(40),
  phone: z.string().max(20),
});

// ---------------------------------------------------------------------------
// POST /payments/razorpay/order
// ---------------------------------------------------------------------------

/**
 * Creates a Razorpay order object server-side. The client uses the returned
 * `razorpayOrderId` to open the Razorpay checkout modal.
 */
router.post("/payments/razorpay/order", async (req: Request, res: Response) => {
  const creds = razorpayCredentials();
  if (!creds) {
    res.status(503).json({ error: "payment gateway not configured" });
    return;
  }
  const [keyId, keySecret] = creds;

  const parsed = createRazorpayOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }

  const { amountPaise, receipt } = parsed.data;

  const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${razorpayBasicAuth(keyId, keySecret)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: receipt ?? `rp-${Date.now()}`,
      payment_capture: 1,
    }),
  });

  if (!rpRes.ok) {
    let body: unknown;
    try {
      body = await rpRes.json();
    } catch {
      body = await rpRes.text();
    }
    req.log.error({ status: rpRes.status, body }, "Razorpay order creation failed");
    res.status(502).json({ error: "payment gateway error" });
    return;
  }

  const rp = (await rpRes.json()) as { id: string; amount: number; currency: string };

  res.json({
    razorpayOrderId: rp.id,
    amount: rp.amount,
    currency: rp.currency,
    keyId,
  });
});

// ---------------------------------------------------------------------------
// POST /payments/razorpay/verify
// ---------------------------------------------------------------------------

/**
 * Verifies the Razorpay payment signature after the checkout modal closes.
 * On success, transitions the order to "preparing". The DB update failure is
 * non-fatal — payment is confirmed by Razorpay and the discrepancy is
 * reconciled manually.
 */
router.post("/payments/razorpay/verify", async (req: Request, res: Response) => {
  const creds = razorpayCredentials();
  if (!creds) {
    res.status(503).json({ error: "payment gateway not configured" });
    return;
  }
  const [, keySecret] = creds;

  const parsed = verifyPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }

  const { orderId, razorpayPaymentId, razorpayOrderId, razorpaySignature } = parsed.data;

  // HMAC-SHA256 verification using the Razorpay signing pattern.
  const hmac = crypto.createHmac("sha256", keySecret);
  hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);
  const expected = hmac.digest("hex");

  let signatureValid = false;
  try {
    signatureValid = crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(razorpaySignature, "hex"),
    );
  } catch {
    // Buffers of different lengths throw — treat as mismatch.
    signatureValid = false;
  }

  if (!signatureValid) {
    req.log.warn({ orderId, razorpayOrderId }, "invalid Razorpay payment signature");
    res.status(400).json({ error: "invalid payment signature" });
    return;
  }

  // Transition order to "preparing".
  try {
    await db
      .update(ordersTable)
      .set({ status: "preparing" })
      .where(eq(ordersTable.externalOrderId, orderId));
  } catch (err) {
    // Payment is confirmed by Razorpay — do not fail the response. The ops
    // team will reconcile via the Razorpay dashboard and the orders table.
    req.log.error({ err, orderId }, "order status update failed after payment verification");
    res.json({ ok: true, orderId, status: "placed", warning: "status_update_failed" });
    return;
  }

  res.json({ ok: true, orderId, status: "preparing" });
});

// ---------------------------------------------------------------------------
// POST /payments/upi/intent
// ---------------------------------------------------------------------------

/**
 * Creates a Razorpay Payment Link restricted to UPI, suitable for
 * WhatsApp/SMS order flows where the customer is not in a browser.
 */
router.post("/payments/upi/intent", async (req: Request, res: Response) => {
  const creds = razorpayCredentials();
  if (!creds) {
    res.status(503).json({ error: "payment gateway not configured" });
    return;
  }
  const [keyId, keySecret] = creds;

  const parsed = upiIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }

  const { amountPaise, orderId, phone } = parsed.data;

  const rpRes = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${razorpayBasicAuth(keyId, keySecret)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      description: "Tanmatra Order",
      reference_id: orderId,
      customer: { contact: phone },
      options: { checkout: { method: { upi: 1 } } },
      expire_by: Math.floor(Date.now() / 1000) + 1800,
    }),
  });

  if (!rpRes.ok) {
    let body: unknown;
    try {
      body = await rpRes.json();
    } catch {
      body = await rpRes.text();
    }
    req.log.error({ status: rpRes.status, body }, "Razorpay payment link creation failed");
    res.status(502).json({ error: "payment gateway error" });
    return;
  }

  const link = (await rpRes.json()) as {
    id: string;
    short_url: string;
    expire_by: number;
  };

  res.json({
    intentId: link.id,
    paymentUrl: link.short_url,
    status: "pending",
    expiresAt: new Date(link.expire_by * 1000).toISOString(),
  });
});

export default router;

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  getDishRationales,
  MAX_RATIONALES_PER_REQUEST,
} from "../lib/dishRationale";

const router: IRouter = Router();

const BodySchema = z.object({
  dishIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_RATIONALES_PER_REQUEST),
});

router.post("/dish-rationales", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  try {
    const rationales = await getDishRationales(req.user.id, parsed.data.dishIds);
    res.json({ rationales });
  } catch (err) {
    req.log.error({ err }, "dish-rationales failed");
    res.status(500).json({ error: "rationale generation failed" });
  }
});

export default router;

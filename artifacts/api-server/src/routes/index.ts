import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import deliveryRouter from "./delivery";
import supportAgentRouter from "./supportAgent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(deliveryRouter);
router.use(supportAgentRouter);

export default router;

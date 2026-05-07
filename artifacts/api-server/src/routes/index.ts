import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import deliveryRouter from "./delivery";
import supportAgentRouter from "./supportAgent";
import opsRouter from "./ops";
import subscriptionsRouter from "./subscriptions";
import loyaltyRouter from "./loyalty";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(deliveryRouter);
router.use(supportAgentRouter);
router.use("/ops", opsRouter);
router.use(subscriptionsRouter);
router.use(loyaltyRouter);

export default router;

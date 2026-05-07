import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import deliveryRouter from "./delivery";
import supportAgentRouter from "./supportAgent";
import opsRouter from "./ops";
import subscriptionsRouter from "./subscriptions";
import loyaltyRouter from "./loyalty";
import preferencesRouter from "./preferences";
import rdAdvisoryRouter from "./rdAdvisory";
import bundlesRouter from "./bundles";
import groupOrdersRouter from "./groupOrders";
import wellnessRouter from "./wellness";
import aiRunsRouter from "./aiRuns";
import opsAgentRouter from "./opsAgent";
import forecastingRouter from "./forecasting";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(deliveryRouter);
router.use(supportAgentRouter);
router.use("/ops", opsRouter);
router.use(subscriptionsRouter);
router.use(loyaltyRouter);
router.use(preferencesRouter);
router.use(rdAdvisoryRouter);
router.use(bundlesRouter);
router.use(groupOrdersRouter);
router.use(wellnessRouter);
router.use(aiRunsRouter);
router.use(opsAgentRouter);
router.use(forecastingRouter);

export default router;

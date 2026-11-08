import { Router, type IRouter } from "express";
import healthRouter from "./health";
import memberRouter from "./member";
import operationsRouter from "./operations";
import attendanceRouter from "./attendance";
import publicRouter from "./public";
import supportRouter from "./support";
import qualityControlRouter from "./quality-control";
import publicReviewsRouter from "./public-reviews";
import operationsReviewsRouter from "./operations-reviews";
import operationsMarketingRouter from "./operations-marketing";
import operationsAnalyticsRouter from "./operations-analytics";

const router: IRouter = Router();
router.use("/public", publicReviewsRouter);
router.use("/public", publicRouter);
router.use("/member", memberRouter);
router.use("/operations/quality", qualityControlRouter);
router.use("/operations", operationsReviewsRouter);
router.use("/operations", operationsMarketingRouter);
router.use("/operations", operationsAnalyticsRouter);
router.use("/operations", operationsRouter);
router.use("/attendance", attendanceRouter);
router.use("/support/staff", supportRouter);

router.use(healthRouter);

export default router;

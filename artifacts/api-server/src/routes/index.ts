import { Router, type IRouter } from "express";
import healthRouter from "./health";
import memberRouter from "./member";
import operationsRouter from "./operations";
import attendanceRouter from "./attendance";
import publicRouter from "./public";
import supportRouter from "./support";

const router: IRouter = Router();
router.use("/public", publicRouter);
router.use("/member", memberRouter);
router.use("/operations", operationsRouter);
router.use("/attendance", attendanceRouter);
router.use("/support/staff", supportRouter);

router.use(healthRouter);

export default router;

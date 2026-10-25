import { Router, type IRouter } from "express";
import healthRouter from "./health";
import memberRouter from "./member";
import operationsRouter from "./operations";
import attendanceRouter from "./attendance";

const router: IRouter = Router();
router.use("/member", memberRouter);
router.use("/operations", operationsRouter);
router.use("/attendance", attendanceRouter);

router.use(healthRouter);

export default router;

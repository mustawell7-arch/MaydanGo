import { Router, type IRouter } from "express";
import healthRouter from "./health";
import memberRouter from "./member";
import operationsRouter from "./operations";

const router: IRouter = Router();
router.use("/member", memberRouter);
router.use("/operations", operationsRouter);

router.use(healthRouter);

export default router;

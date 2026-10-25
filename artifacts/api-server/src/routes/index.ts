import { Router, type IRouter } from "express";
import healthRouter from "./health";
import memberRouter from "./member";

const router: IRouter = Router();
router.use("/member", memberRouter);

router.use(healthRouter);

export default router;

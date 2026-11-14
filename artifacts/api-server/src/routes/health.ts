import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";

type HealthDependencies = {
  checkDatabase(): Promise<unknown>;
};

const databaseHealthCheck = async () => db.execute(sql`select 1`);

export function createHealthRouter(dependencies: HealthDependencies = {
  checkDatabase: databaseHealthCheck,
}): IRouter {
  const router: IRouter = Router();

  router.get("/healthz", async (_req, res) => {
    try {
      await dependencies.checkDatabase();
      res.json(HealthCheckResponse.parse({ status: "ok" }));
    } catch {
      res.status(503).json(HealthCheckResponse.parse({ status: "unavailable" }));
    }
  });

  return router;
}

export default createHealthRouter();

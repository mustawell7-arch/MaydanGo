import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { createHealthRouter } from "./health";

let server: Server | null = null;
let databaseUnavailable = false;

const app = express();
app.use(createHealthRouter({
  async checkDatabase() {
    if (databaseUnavailable) throw new Error("Database unavailable");
  },
}));

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
});

test("health endpoint reports database readiness without exposing internal errors", async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/healthz`;

  const healthy = await fetch(endpoint);
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { status: "ok" });

  databaseUnavailable = true;
  const unavailable = await fetch(endpoint);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: "unavailable" });
});

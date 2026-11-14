import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { createRateLimitMiddleware } from "./rate-limit";

let server: Server | null = null;
let currentTime = 10_000;

const app = express();
app.use((request, _response, next) => {
  Object.assign(request, { testAccountId: request.get("x-test-account") ?? null });
  next();
});
app.use(createRateLimitMiddleware({
  windowMs: 60_000,
  maxRequests: 2,
  now: () => currentTime,
  keyForRequest: request => (request as typeof request & { testAccountId: string | null }).testAccountId,
}));
app.get("/resource", (_request, response) => response.json({ ok: true }));

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
});

test("rate limits each account independently and resets after the window", async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/resource`;
  const request = (account: string) => fetch(endpoint, { headers: { "x-test-account": account } });

  assert.equal((await request("account-a")).status, 200);
  assert.equal((await request("account-a")).status, 200);
  const limited = await request("account-a");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal(limited.headers.get("ratelimit-remaining"), "0");

  assert.equal((await request("account-b")).status, 200);
  currentTime += 60_000;
  assert.equal((await request("account-a")).status, 200);
});

test("requests without an account identity are left to the route's authentication guard", async () => {
  assert.ok(server);
  const endpoint = `http://127.0.0.1:${(server!.address() as { port: number }).port}/resource`;
  const response = await fetch(endpoint);
  assert.equal(response.status, 200);
});

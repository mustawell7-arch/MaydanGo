import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import express from "express";
import { createAdminRbacMiddleware, requiredAdminActions } from "./admin-rbac";
import type { AdminAction } from "../lib/admin-roles";

let server: Server | null = null;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  Object.assign(req, {
    auth: Object.assign(
      () => ({ userId: req.headers["x-test-user"], tokenType: "session_token" }),
      { [Symbol.for("@clerk/express.auth")]: true },
    ),
  });
  next();
});

let financeActions: AdminAction[] = ["view", "edit"];
app.use(createAdminRbacMiddleware({
  async getRole(userId) {
    return userId === "finance-test-user" ? "finance_admin" : null;
  },
  async getConfiguredActions(role) {
    return role === "finance_admin" ? financeActions : null;
  },
}));
app.post("/api/operations/finance/refunds/:billingId", (_req, res) => {
  res.sendStatus(204);
});

after(async () => {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
});

test("action mapping distinguishes approvals, sensitive data, refunds, and exports", () => {
  assert.deepEqual(
    requiredAdminActions("POST", "/api/operations/finance/reviews/item/decision", { decision: "reject" }),
    ["reject", "view_sensitive_data", "manage_payments"],
  );
  assert.deepEqual(
    requiredAdminActions("POST", "/api/operations/finance/refunds/item"),
    ["refund", "view_sensitive_data"],
  );
  assert.deepEqual(
    requiredAdminActions("POST", "/api/support/staff/device-changes/item/approve"),
    ["approve", "view_sensitive_data"],
  );
  assert.deepEqual(
    requiredAdminActions("GET", "/api/operations/finance/invoices/item/document"),
    ["export", "view_sensitive_data"],
  );
});

test("configured role permissions block sensitive actions until explicitly granted", async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/operations/finance/refunds/test-billing`;
  const request = () => fetch(endpoint, {
    method: "POST",
    headers: { "x-test-user": "finance-test-user" },
  });

  assert.equal((await request()).status, 403);
  financeActions = ["view", "refund", "view_sensitive_data"];
  assert.equal((await request()).status, 204);
});

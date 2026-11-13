import { clerkClient } from "@clerk/express";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, operationAudit, operators, pool } from "@workspace/db";
import { ADMIN_ROLE_PERMISSIONS } from "../src/lib/admin-roles";
import { logger } from "../src/lib/logger";

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This bootstrap command is restricted to Development.");
  }

  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    throw new Error("Pass the email of an existing, verified Development account.");
  }

  const matches = await clerkClient.users.getUserList({ emailAddress: [email], limit: 100 });
  const accounts = matches.data.flatMap(user =>
    user.emailAddresses
      .filter(address =>
        address.emailAddress.toLowerCase() === email
        && address.verification?.status === "verified",
      )
      .map(() => user.id),
  );
  if (accounts.length !== 1) {
    throw new Error("A single existing account with this verified email is required.");
  }
  const userId = accounts[0];

  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('maydango-super-admin-bootstrap'))`);
    const activeSuperAdmins = await tx.select({ userId: operators.userId }).from(operators)
      .where(eq(operators.role, "super_admin")).for("update");
    const [existing] = await tx.select().from(operators)
      .where(eq(operators.userId, userId)).for("update");

    if (existing?.role === "super_admin") return;
    if (activeSuperAdmins.length > 0) {
      throw new Error("A Super Admin already exists; use the protected console for future changes.");
    }
    if (existing && (
      existing.role === "admin_suspended"
      || !Object.hasOwn(ADMIN_ROLE_PERMISSIONS, existing.role)
    )) {
      throw new Error("This account has a non-admin or suspended role and was not changed.");
    }

    if (existing) {
      await tx.update(operators)
        .set({ role: "super_admin", suspendedRole: null, partnerId: null })
        .where(eq(operators.userId, userId));
    } else {
      await tx.insert(operators).values({
        userId,
        role: "super_admin",
        partnerId: null,
      });
    }

    await tx.insert(operationAudit).values({
      id: randomUUID(),
      actorId: "system:development-bootstrap",
      action: "super_admin.initial_account.created",
      targetId: userId,
      detail: "Initial Development Super Admin role assigned.",
    });
  });

  logger.info("Development Super Admin bootstrap finished.");
}

try {
  await main();
} catch {
  logger.error("Development Super Admin bootstrap failed; no account details were logged.");
  process.exitCode = 1;
} finally {
  await pool.end();
}

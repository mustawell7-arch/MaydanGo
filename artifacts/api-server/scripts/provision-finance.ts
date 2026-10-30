import { db, pool, operators } from "@workspace/db";

// Trusted shell operation, not a public HTTP/bootstrap endpoint.
const userId = process.argv[2];
if (!userId?.startsWith("user_")) throw new Error("Usage: pnpm exec tsx scripts/provision-finance.ts <verified Clerk user ID>");
await db.insert(operators).values({ userId, role: "finance", partnerId: null }).onConflictDoNothing();
await pool.end();
console.log("Finance provisioning complete (existing assignments unchanged).");

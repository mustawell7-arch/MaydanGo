import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "../lib/db/src/index.ts";

const migrationPaths = [
  new URL("../lib/db/migrations/0003_offering_approval_workflow.sql", import.meta.url),
  new URL("../lib/db/migrations/0006_additive_workspace_schema.sql", import.meta.url),
  new URL("../lib/db/migrations/0007_urgent_support_reports.sql", import.meta.url),
  new URL("../lib/db/migrations/0008_support_alert_payload.sql", import.meta.url),
  new URL("../lib/db/migrations/0009_urgent_alert_status.sql", import.meta.url),
  new URL("../lib/db/migrations/0010_urgent_report_escalation.sql", import.meta.url),
];

try {
  for (const migrationUrl of migrationPaths) {
    const migration = await readFile(fileURLToPath(migrationUrl), "utf8");
    await pool.query(migration);
    console.log(`Applied ${fileURLToPath(migrationUrl).split("/").at(-1)}`);
  }
} finally {
  await pool.end();
}

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "../lib/db/src/index.ts";

const migrationPath = fileURLToPath(
  new URL("../lib/db/migrations/0004_append_only_audit_history.sql", import.meta.url),
);

try {
  const migration = await readFile(migrationPath, "utf8");
  await pool.query(migration);
} finally {
  await pool.end();
}

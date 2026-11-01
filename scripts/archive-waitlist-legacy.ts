import { readFile } from "node:fs/promises";
import { pool } from "../lib/db/src/index.ts";

const legacyColumns = ["reservation_id", "reason", "joined_at", "updated_at"];
const migrationSql = await readFile(
  new URL("../lib/db/migrations/0002_archive_waitlist_legacy.sql", import.meta.url),
  "utf8",
);
const client = await pool.connect();

try {
  const { rows: [table] } = await client.query<{ tableName: string | null }>(
    "SELECT to_regclass('waitlist_entries')::text AS \"tableName\"",
  );
  if (!table?.tableName) {
    console.log("Waitlist table not present; there are no legacy columns to archive.");
  } else {
    const { rows: columns } = await client.query<{ columnName: string }>(
      `SELECT attname AS "columnName"
       FROM pg_attribute
       WHERE attrelid = to_regclass('waitlist_entries')
         AND attnum > 0 AND NOT attisdropped`,
    );
    const present = legacyColumns.filter(name => columns.some(column => column.columnName === name));
    if (present.length === 0) {
      console.log("No legacy waitlist columns remain to archive.");
    } else if (present.length !== legacyColumns.length) {
      throw new Error(`Only some legacy waitlist columns remain (${present.join(", ")}); refusing a partial archive.`);
    } else {
      await client.query("BEGIN");
      try {
        await client.query(migrationSql);
        const { rows: [verification] } = await client.query<{ missingCount: number; remainingCount: number }>(
          `SELECT
             (SELECT count(*)::int
              FROM waitlist_entries AS entry
              LEFT JOIN waitlist_legacy_history AS history
                ON history.waitlist_entry_id = entry.id
              WHERE history.waitlist_entry_id IS NULL) AS "missingCount",
             (SELECT count(*)::int
              FROM pg_attribute
              WHERE attrelid = to_regclass('waitlist_entries')
                AND attname = ANY($1::text[]) AND NOT attisdropped) AS "remainingCount"`,
          [legacyColumns],
        );
        if (!verification || verification.missingCount !== 0 || verification.remainingCount !== 0) {
          throw new Error("Waitlist legacy archive verification failed; refusing to commit the migration.");
        }
        await client.query("COMMIT");
        console.log("Archived legacy waitlist values and verified every source entry before removing its compatibility columns.");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  }
} finally {
  client.release();
  await pool.end();
}

import { readFile } from "node:fs/promises";
import { pool } from "../lib/db/src/index.ts";

const migrationSql = await readFile(
  new URL("../lib/db/migrations/0001_waitlist_queue_backfill.sql", import.meta.url),
  "utf8",
);
const client = await pool.connect();

try {
  const { rows: [table] } = await client.query<{ tableName: string | null }>(
    "SELECT to_regclass('waitlist_entries')::text AS \"tableName\"",
  );
  if (!table?.tableName) {
    console.log("Waitlist table not present; Drizzle will create the current schema.");
  } else {
    const { rows: columns } = await client.query<{ columnName: string }>(
      `SELECT attname AS "columnName"
       FROM pg_attribute
       WHERE attrelid = to_regclass('waitlist_entries')
         AND attnum > 0 AND NOT attisdropped`,
    );
    let alreadyBackfilled = false;
    const hasLegacyJoinedAt = columns.some(column => column.columnName === "joined_at");
    const hasCurrentColumns = ["queue_position", "created_at"]
      .every(name => columns.some(column => column.columnName === name));
    if (hasCurrentColumns) {
      const { rows: [state] } = await client.query<{ ready: boolean }>(
        `SELECT
           EXISTS (
             SELECT 1 FROM pg_attribute
             WHERE attrelid = to_regclass('waitlist_entries')
               AND attname = 'queue_position' AND attnotnull AND NOT attisdropped
           )
           AND EXISTS (
             SELECT 1 FROM pg_attribute
             WHERE attrelid = to_regclass('waitlist_entries')
               AND attname = 'created_at' AND attnotnull AND NOT attisdropped
           )
           AND EXISTS (
             SELECT 1 FROM pg_index
             WHERE indrelid = to_regclass('waitlist_entries')
               AND indexrelid = to_regclass('waitlist_position_per_offering')
               AND indisunique
           )
           AND NOT EXISTS (
             SELECT 1 FROM waitlist_entries
             WHERE created_at IS NULL OR queue_position IS NULL
               ${hasLegacyJoinedAt ? "OR created_at IS DISTINCT FROM joined_at" : ""}
           ) AS ready`,
      );
      alreadyBackfilled = Boolean(state?.ready);
    }
    if (!hasLegacyJoinedAt && !alreadyBackfilled) {
      throw new Error("waitlist_entries has no joined_at and its current queue schema is incomplete; refusing to guess.");
    }
    if (alreadyBackfilled) {
      console.log("Waitlist queue order and legacy timestamps are already backfilled.");
    } else {
      await client.query("BEGIN");
      try {
        await client.query(migrationSql);
        const { rows: [verification] } = await client.query<{ rowCount: number; incompleteCount: number }>(
          `SELECT
             count(*)::int AS "rowCount",
             count(*) FILTER (
               WHERE queue_position IS NULL OR created_at IS NULL OR joined_at IS NULL
             )::int AS "incompleteCount"
           FROM waitlist_entries`,
        );
        if (!verification || verification.incompleteCount !== 0) {
          throw new Error("Waitlist backfill left records without a position or preserved timestamp.");
        }
        await client.query("COMMIT");
        console.log(`Backfilled ${verification.rowCount} waitlist records; legacy reservation and reason columns were retained.`);
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

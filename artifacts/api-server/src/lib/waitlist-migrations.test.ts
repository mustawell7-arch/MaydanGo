import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

const backfillPath = fileURLToPath(
  new URL("../../../../lib/db/migrations/0001_waitlist_queue_backfill.sql", import.meta.url),
);
const archivePath = fileURLToPath(
  new URL("../../../../lib/db/migrations/0002_archive_waitlist_legacy.sql", import.meta.url),
);

after(async () => {
  await pool.end();
});

test("legacy waitlist rows keep deterministic order and archived history during upgrade", async () => {
  const client = await pool.connect();
  const schemaName = `waitlist_migration_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
    await client.query(`
      CREATE TABLE waitlist_entries (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        offering_id text NOT NULL,
        queue_position integer,
        created_at timestamptz,
        reservation_id text,
        reason text,
        joined_at timestamptz,
        updated_at timestamptz
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX waitlist_position_per_offering
      ON waitlist_entries (offering_id, queue_position)
    `);
    await client.query(`
      INSERT INTO waitlist_entries
        (id, user_id, offering_id, queue_position, created_at, reservation_id, reason, joined_at, updated_at)
      VALUES
        ('legacy-b', 'member-b', 'offering-a', NULL, '2025-01-04T00:00:00Z', 'reservation-b', 'second legacy reason', '2025-01-01T10:00:00Z', '2025-01-02T10:00:00Z'),
        ('legacy-a', 'member-a', 'offering-a', NULL, '2025-01-04T00:00:00Z', 'reservation-a', 'first legacy reason', '2025-01-01T10:00:00Z', '2025-01-02T09:00:00Z'),
        ('positioned', 'member-p', 'offering-a', 8, '2025-01-03T00:00:00Z', 'reservation-p', 'existing position', '2025-01-03T00:00:00Z', '2025-01-03T01:00:00Z'),
        ('legacy-created', 'member-c', 'offering-b', NULL, '2024-12-31T00:00:00Z', 'reservation-c', 'created time fallback', NULL, '2025-01-01T00:00:00Z')
    `);

    const backfill = await readFile(backfillPath, "utf8");
    await client.query(backfill);
    const ranked = await client.query(`
      SELECT id, queue_position, created_at, joined_at
      FROM waitlist_entries
      WHERE offering_id = 'offering-a'
      ORDER BY queue_position
    `);
    assert.deepEqual(ranked.rows.map(row => [row.id, row.queue_position]), [
      ["positioned", 1],
      ["legacy-a", 2],
      ["legacy-b", 3],
    ]);
    const createdTimeFallback = await client.query(`
      SELECT created_at, joined_at FROM waitlist_entries WHERE id = 'legacy-created'
    `);
    assert.equal(
      new Date(createdTimeFallback.rows[0].created_at).toISOString(),
      new Date(createdTimeFallback.rows[0].joined_at).toISOString(),
    );

    const archive = await readFile(archivePath, "utf8");
    await client.query(archive);
    const archived = await client.query(`
      SELECT waitlist_entry_id, reservation_id, reason, joined_at, updated_at
      FROM waitlist_legacy_history
      ORDER BY waitlist_entry_id
    `);
    assert.deepEqual(archived.rows.map(row => [
      row.waitlist_entry_id, row.reservation_id, row.reason,
    ]), [
      ["legacy-a", "reservation-a", "first legacy reason"],
      ["legacy-b", "reservation-b", "second legacy reason"],
      ["legacy-created", "reservation-c", "created time fallback"],
      ["positioned", "reservation-p", "existing position"],
    ]);

    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'waitlist_entries'`,
      [schemaName],
    );
    const remainingColumns = new Set(columns.rows.map(row => row.column_name));
    for (const legacyColumn of ["reservation_id", "reason", "joined_at", "updated_at"]) {
      assert.equal(remainingColumns.has(legacyColumn), false);
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

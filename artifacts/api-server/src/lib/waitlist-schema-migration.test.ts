import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { pool } from "@workspace/db";

after(async () => {
  await pool.end();
});

test("legacy waitlist backfill preserves history and assigns stable per-offering order", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(`
        CREATE TEMP TABLE waitlist_entries (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          offering_id text NOT NULL,
          reservation_id text,
          status text NOT NULL DEFAULT 'waiting',
          reason text,
          joined_at timestamptz,
          updated_at timestamptz
        )
      `);
      await client.query(
        `INSERT INTO waitlist_entries (id, user_id, offering_id, reservation_id, reason, joined_at)
         VALUES
           ('member-b', 'user-b', 'class-a', 'reservation-b', 'legacy b', '2026-04-01T10:00:00Z'),
           ('member-a', 'user-a', 'class-a', 'reservation-a', 'legacy a', '2026-04-01T10:00:00Z'),
           ('member-c', 'user-c', 'class-a', NULL, 'legacy c', '2026-04-01T11:00:00Z'),
           ('member-d', 'user-d', 'class-b', NULL, 'other class', '2026-04-01T09:00:00Z'),
           ('member-e', 'user-e', 'class-b', NULL, 'missing timestamp', NULL)`,
      );
      const sql = await readFile(
        new URL("../../../../lib/db/migrations/0001_waitlist_queue_backfill.sql", import.meta.url),
        "utf8",
      );
      await client.query(sql);
      await client.query(sql);

      const { rows } = await client.query<{
        id: string;
        offering_id: string;
        queue_position: number;
        created_at: Date;
        joined_at: Date;
        reservation_id: string | null;
        reason: string | null;
      }>(`SELECT id, offering_id, queue_position, created_at, joined_at, reservation_id, reason
          FROM waitlist_entries ORDER BY offering_id, queue_position`);

      assert.deepEqual(rows.map(row => [row.id, row.queue_position]), [
        ["member-a", 1],
        ["member-b", 2],
        ["member-c", 3],
        ["member-d", 1],
        ["member-e", 2],
      ]);
      const memberA = rows.find(row => row.id === "member-a");
      const memberB = rows.find(row => row.id === "member-b");
      const memberE = rows.find(row => row.id === "member-e");
      assert.equal(memberA?.created_at.toISOString(), memberA?.joined_at.toISOString());
      assert.equal(memberB?.reservation_id, "reservation-b");
      assert.equal(memberB?.reason, "legacy b");
      assert.ok(memberE?.created_at instanceof Date);
      assert.ok(memberE?.joined_at instanceof Date);
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    client.release();
  }
});

test("legacy waitlist fields are archived before source columns are removed", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query("CREATE SCHEMA waitlist_migration_archive_test");
      await client.query("SET LOCAL search_path TO waitlist_migration_archive_test");
      await client.query(`
        CREATE TABLE waitlist_entries (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          offering_id text NOT NULL,
          queue_position integer NOT NULL,
          status text NOT NULL DEFAULT 'waiting',
          created_at timestamptz NOT NULL DEFAULT now(),
          reservation_id text,
          reason text,
          joined_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        )
      `);
      await client.query(
        `INSERT INTO waitlist_entries
           (id, user_id, offering_id, queue_position, reservation_id, reason, joined_at, updated_at)
         VALUES
           ('entry-1', 'user-1', 'class-1', 1, 'reservation-1', 'legacy reason', '2026-04-01T10:00:00Z', '2026-04-02T10:00:00Z'),
           ('entry-2', 'user-2', 'class-1', 2, NULL, NULL, '2026-04-01T11:00:00Z', '2026-04-02T11:00:00Z')`,
      );
      const sql = await readFile(
        new URL("../../../../lib/db/migrations/0002_archive_waitlist_legacy.sql", import.meta.url),
        "utf8",
      );
      await client.query(sql);

      const { rows: archiveRows } = await client.query<{
        waitlist_entry_id: string;
        reservation_id: string | null;
        reason: string | null;
        joined_at: Date;
        updated_at: Date;
      }>(`SELECT waitlist_entry_id, reservation_id, reason, joined_at, updated_at
          FROM waitlist_legacy_history ORDER BY waitlist_entry_id`);
      assert.equal(archiveRows.length, 2);
      assert.deepEqual(
        [archiveRows[0].reservation_id, archiveRows[0].reason],
        ["reservation-1", "legacy reason"],
      );
      assert.ok(archiveRows.every(row => row.joined_at instanceof Date && row.updated_at instanceof Date));

      const { rows: columns } = await client.query<{ columnName: string }>(
        `SELECT column_name AS "columnName"
         FROM information_schema.columns
         WHERE table_schema = 'waitlist_migration_archive_test'
           AND table_name = 'waitlist_entries'`,
      );
      assert.ok(columns.some(column => column.columnName === "queue_position"));
      assert.ok(columns.some(column => column.columnName === "created_at"));
      assert.ok(columns.every(column => !["reservation_id", "reason", "joined_at", "updated_at"].includes(column.columnName)));
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    client.release();
  }
});

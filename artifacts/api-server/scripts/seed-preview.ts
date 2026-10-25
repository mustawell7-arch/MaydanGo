import { db, offerings, pool } from "@workspace/db";

// Explicit sample catalogue only; never imports device reservations or enables live partners.
const sessions = [
  ["rise-strength-1", "Full-body strength", "baghdad", "rise-studio"],
  ["olive-flow-1", "Evening unwind yoga", "baghdad", "olive-room"],
  ["padel-open-1", "Padel social: open play", "baghdad", "padel-house"],
  ["erbil-strength-1", "Strength, your way", "erbil", "citadel-movement"],
  ["slemani-flow-1", "Gentle evening flow", "sulaymaniyah", "slemani-yoga-house"],
  ["basra-padel-1", "Padel basics", "basra", "basra-palm-courts"],
  ["mosul-mobility-1", "Everyday mobility", "mosul", "tigris-wellness"],
  ["online-mobility-1", "Mobility from home", "online", "online"],
  ["online-strength-1", "Strong at home", "online", "online"],
];
const events = [
  ["move-together-erbil", "Move Together Weekend", "erbil", "sample-park"],
  ["riverfront-basra", "Basra Wellness by the River", "basra", "sample-riverfront"],
  ["community-games-baghdad", "Baghdad Community Games", "baghdad", "sample-grounds"],
];
const coaching = [
  ["coach-noor", "Noor Ahmed", "noor-tue-19"], ["coach-noor", "Noor Ahmed", "noor-thu-18"],
  ["coach-rojin", "Rojin Hassan", "rojin-wed-11"], ["coach-rojin", "Rojin Hassan", "rojin-sat-17"],
  ["coach-rojin", "Rojin Hassan", "rojin-sun-10"], ["coach-omar", "Omar Saeed", "omar-mon-1830"],
  ["coach-omar", "Omar Saeed", "omar-fri-16"],
];
const now = Date.now();
const base = (kind: string, targetId: string, title: string, city: string, facility: string, index: number, slot = "") => ({
  id: `preview:${kind}:${targetId}:${slot}`, kind, targetId, slot, title, city, facility,
  scope: "preview", active: true, category: kind, tiers: ["M", "L", "XL"],
  startsAt: new Date(now + (index + 2) * 86400000),
  endsAt: new Date(now + (index + 2) * 86400000 + 3600000),
  cancellationDeadline: new Date(now + (index + 2) * 86400000 - 3600000),
  capacity: 50, additionalPayment: false,
  gender: ["rise-strength-1", "olive-flow-1", "erbil-strength-1", "slemani-flow-1"].includes(targetId) ? "female" : "all",
});
try {
  const rows = [
    ...sessions.map(([id, title, city, facility], i) => base("session", id, title, city, facility, i)),
    ...events.map(([id, title, city, facility], i) => base("event", id, title, city, facility, i)),
    ...coaching.map(([id, title, slot], i) => base("coach", id, title, "online", id, i, slot)),
  ];
  for (const row of rows) {
    await db.insert(offerings).values(row).onConflictDoUpdate({
      target: offerings.id, set: { gender: row.gender },
    });
  }
  console.log("Sample catalogue seeded. No live partners, memberships, or reservations were imported.");
} finally { await pool.end(); }

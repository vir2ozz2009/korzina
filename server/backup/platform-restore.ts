import { identifier, type Snapshot, snapshotPlatform } from "./snapshot";

// The caller only passes RESTORE_PLATFORM. Never accept a database ID from HTTP.
export async function restorePlatform(target: D1Database, snapshot: Snapshot) {
  if (snapshot.version !== 1) throw new Error("Unknown backup format");
  const current = await snapshotPlatform(target);
  const schema: { type: string; name: string; sql: string }[] = JSON.parse(snapshot.schema);
  const statements: D1PreparedStatement[] = [target.prepare("PRAGMA defer_foreign_keys=ON")];
  for (const table of current.tables.filter((t) => t.name !== "sqlite_sequence"))
    statements.push(target.prepare(`DROP TABLE ${identifier(table.name)}`));
  for (const item of schema.filter((s) => s.type === "table" && s.name !== "sqlite_sequence"))
    statements.push(target.prepare(item.sql));
  if (snapshot.tables.some((t) => t.name === "sqlite_sequence"))
    statements.push(target.prepare("DELETE FROM sqlite_sequence"));
  for (const table of [
    ...snapshot.tables.filter((t) => t.name !== "sqlite_sequence"),
    ...snapshot.tables.filter((t) => t.name === "sqlite_sequence"),
  ]) {
    if (table.name === "sqlite_sequence") statements.push(target.prepare("DELETE FROM sqlite_sequence"));
    for (const row of table.rows)
      statements.push(
        target
          .prepare(
            `INSERT INTO ${identifier(table.name)} (${table.columns.map(identifier).join(",")}) VALUES (${table.columns.map(() => "?").join(",")})`,
          )
          .bind(...row.map((cell) => (typeof cell === "object" && cell !== null ? cell.bytes : cell))),
      );
  }
  for (const item of schema.filter((s) => s.type !== "table")) statements.push(target.prepare(item.sql));
  await target.batch(statements);
  if ((await target.prepare("PRAGMA foreign_key_check").all()).results.length)
    throw new Error("Restored D1 foreign keys failed");
  return snapshotPlatform(target);
}

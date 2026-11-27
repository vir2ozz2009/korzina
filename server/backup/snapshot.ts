// Portable, versioned snapshots. BLOBs remain binary after a JSON round trip.
type Cell = string | number | null | { bytes: number[] };
type Table = { name: string; columns: string[]; rows: Cell[][] };
export type Snapshot = { version: 1; schema: string; tables: Table[] };
export const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const pack = (value: SqlStorageValue): Cell =>
  value instanceof ArrayBuffer ? { bytes: [...new Uint8Array(value)] } : value;
const unpack = (value: Cell): SqlStorageValue =>
  typeof value === "object" && value !== null ? new Uint8Array(value.bytes).buffer : value;

function schema(storage: DurableObjectStorage) {
  return JSON.stringify(
    storage.sql
      .exec(
        "SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' ORDER BY name",
      )
      .toArray(),
  );
}

export function snapshotShop(storage: DurableObjectStorage): Snapshot {
  return storage.transactionSync(() => {
    const tables = storage.sql
      .exec<{ name: string; type: string }>("PRAGMA table_list")
      .toArray()
      .filter(
        (t) =>
          (t.type === "table" || t.type === "virtual") &&
          !t.name.startsWith("_cf_") &&
          (!t.name.startsWith("sqlite_") || t.name === "sqlite_sequence"),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      version: 1,
      schema: schema(storage),
      tables: tables.map((table) => {
        const columns =
          table.name === "sqlite_sequence"
            ? ["name", "seq"]
            : storage.sql
                .exec<{ name: string; hidden: number }>(`PRAGMA table_xinfo(${identifier(table.name)})`)
                .toArray()
                .filter((c) => c.hidden === 0)
                .map((c) => c.name);
        if (table.type === "virtual") columns.unshift("rowid");
        const cursor = storage.sql.exec(`SELECT ${columns.map(identifier).join(",")} FROM ${identifier(table.name)}`);
        return { name: table.name, columns, rows: [...cursor.raw()].map((row) => row.map(pack)) };
      }),
    };
  });
}

// Called only by the private RestoreShop class, never the serving Shop namespace.
export function restoreShop(storage: DurableObjectStorage, snapshot: Snapshot) {
  if (snapshot.version !== 1 || snapshot.schema !== schema(storage)) throw new Error("Backup schema mismatch");
  storage.transactionSync(() => {
    storage.sql.exec("PRAGMA defer_foreign_keys=ON");
    const triggers = storage.sql
      .exec<{ name: string; sql: string }>("SELECT name,sql FROM sqlite_schema WHERE type='trigger'")
      .toArray();
    for (const trigger of triggers) storage.sql.exec(`DROP TRIGGER ${identifier(trigger.name)}`);
    for (const table of snapshot.tables) storage.sql.exec(`DELETE FROM ${identifier(table.name)}`);
    for (const table of [
      ...snapshot.tables.filter((t) => t.name !== "sqlite_sequence"),
      ...snapshot.tables.filter((t) => t.name === "sqlite_sequence"),
    ]) {
      if (table.name === "sqlite_sequence") storage.sql.exec("DELETE FROM sqlite_sequence");
      const insert = `INSERT INTO ${identifier(table.name)} (${table.columns.map(identifier).join(",")}) VALUES (${table.columns.map(() => "?").join(",")})`;
      for (const row of table.rows) storage.sql.exec(insert, ...row.map(unpack));
    }
    for (const trigger of triggers) storage.sql.exec(trigger.sql);
    if (storage.sql.exec("PRAGMA foreign_key_check").toArray().length)
      throw new Error("Backup foreign key check failed");
  });
}

export async function snapshotPlatform(db: D1Database): Promise<Snapshot> {
  const schemaSql =
    "SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') AND name NOT LIKE '_cf_%' ORDER BY name";
  const schemaRows = (await db.prepare(schemaSql).all<{ type: string; name: string; sql: string }>()).results;
  const names = schemaRows.filter((t) => t.type === "table").map((t) => t.name);
  // D1 batch is one transaction: every table is read from the same committed state.
  const results = await db.batch<Record<string, unknown>>([
    db.prepare(schemaSql),
    ...names.map((name) => db.prepare(`SELECT * FROM ${identifier(name)}`)),
  ]);
  if (JSON.stringify(results[0].results) !== JSON.stringify(schemaRows)) throw new Error("Migration during backup");
  return {
    version: 1,
    schema: JSON.stringify(schemaRows),
    tables: names.map((name, i) => {
      const rows = results[i + 1].results;
      return {
        name,
        columns: rows.length ? Object.keys(rows[0]) : [],
        rows: rows.map(
          (row) => Object.values(row).map((value) => (Array.isArray(value) ? { bytes: value } : value)) as Cell[],
        ),
      };
    }),
  };
}

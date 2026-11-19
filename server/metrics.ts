export type SqlMetrics = { sql: number; transactions: number; rowsRead: number; rowsWritten: number; dbMs: number };
export class RequestMetrics {
  private readonly started = performance.now();
  private readonly cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];
  private dbMs = 0;
  private queries = 0;
  private transactions = 0;

  private timed<T>(operation: () => T): T {
    const start = performance.now();
    try {
      return operation();
    } finally {
      this.dbMs += performance.now() - start;
    }
  }
  private cursor<T extends object>(cursor: T): T {
    const proxy = new Proxy(cursor, {
      get: (target, property) => {
        if (property === Symbol.iterator) return () => proxy;
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) =>
          this.timed(() => {
            const result = value.apply(target, args);
            return property === "raw" ? this.cursor(result) : result;
          });
      },
    });
    return proxy;
  }

  storage(storage: DurableObjectStorage): DurableObjectStorage {
    const sql = new Proxy(storage.sql, {
      get: (target, property) =>
        property === "exec"
          ? <T extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]) => {
              this.queries++;
              return this.timed(() => {
                const cursor = target.exec<T>(query, ...bindings);
                this.cursors.push(cursor);
                return this.cursor(cursor);
              });
            }
          : Reflect.get(target, property, target),
    });
    return new Proxy(storage, {
      get: (target, property) => {
        if (property === "sql") return sql;
        if (property === "transactionSync")
          return <T>(run: () => T) => {
            this.transactions++;
            return storage.transactionSync(run);
          };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  snapshot(): SqlMetrics {
    return {
      sql: this.queries,
      transactions: this.transactions,
      rowsRead: this.cursors.reduce((n, c) => n + c.rowsRead, 0),
      rowsWritten: this.cursors.reduce((n, c) => n + c.rowsWritten, 0),
      dbMs: this.dbMs,
    };
  }
  record(route: string, shopId: string | undefined, requestId: string, status: number, sample = Math.random() < 0.01) {
    const metric = {
      event: "api_request",
      route,
      shopId,
      requestId,
      status,
      ...this.snapshot(),
      handlerMs: performance.now() - this.started,
    };
    if (sample) console.log(JSON.stringify(metric));
    return metric;
  }
}

export function assertSqlBudget(
  actual: SqlMetrics,
  budget: Partial<Pick<SqlMetrics, "sql" | "rowsRead" | "rowsWritten">>,
): void {
  for (const key of ["sql", "rowsRead", "rowsWritten"] as const) {
    const limit = budget[key];
    if (limit !== undefined && actual[key] > limit)
      throw new Error(`SQL budget exceeded: ${key} ${actual[key]} > ${limit}`);
  }
}

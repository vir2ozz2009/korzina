import { zValidator } from "@hono/zod-validator";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { echoInput } from "../../../src/shared/contracts/diagnostics";
import { ApiError } from "../../../src/shared/errors";
import { type CommandVariables, idempotency } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";

export type DiagnosticEnv = {
  Bindings: { storage: DurableObjectStorage; db: DrizzleSqliteDODatabase };
  Variables: CommandVariables;
};
export const diagnostics = new Hono<DiagnosticEnv>().post(
  "/echo",
  bodyLimit({
    maxSize: 4096,
    onError: () => {
      throw new ApiError("PAYLOAD_TOO_LARGE", "Слишком большой запрос");
    },
  }),
  idempotency,
  zValidator("json", echoInput, (result) => {
    if (!result.success)
      throw new ApiError(
        "VALIDATION",
        "Некорректные данные",
        result.error.issues.map(({ path, code }) => ({ path, code })),
      );
  }),
  (c) => {
    // Demo-only, no business data or user identity. F4 commands must pass their authenticated scope.
    const result = executeCommand(c.env.storage, c.env.db, "diagnostics", c.get("command"), () => ({
      body: { value: c.req.valid("json").value, operationId: crypto.randomUUID() },
      status: 201,
    }));
    return c.json(result.body, 201);
  },
);

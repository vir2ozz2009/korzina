import type { LaunchReadiness } from "../../../src/shared/contracts/launch";
import { ApiError, type ErrorCode } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { platformReplay } from "../../platform/admin/commands";
import { launchSnapshot } from "./readiness";

type Request = {
  actor: string;
  via: "seller" | "admin";
  command: CommandIdentity;
  revision?: string;
  version?: number;
  force?: boolean;
};
type Status = { id: string; slug: string; status: "active"; version: number };
export type OpenResponse =
  | { ok: true; result: Status }
  | { ok: false; code: ErrorCode; message: string; details?: LaunchReadiness };

const allowed = (input: Request) =>
  input.via === "admin"
    ? `EXISTS(
  SELECT 1 FROM platform_admins WHERE account_id=?
)`
    : `EXISTS(
  SELECT 1 FROM memberships WHERE account_id=? AND shop_id=shops.id AND revoked_at IS NULL
  AND (role='owner' OR (role='employee' AND 'publish' IN
    (SELECT value FROM json_each(CASE WHEN json_valid(permissions) THEN permissions ELSE '[]' END))))
)`;

async function verifyAccess(database: D1Database, id: string, input: Request) {
  const actor = await database
    .withSession("first-primary")
    .prepare(`SELECT 1 FROM shops WHERE id=? AND ${allowed(input)}`)
    .bind(id, input.actor)
    .first();
  if (!actor) throw new ApiError("FORBIDDEN", "Недостаточно прав");
}

export async function openDraft(
  storage: DurableObjectStorage,
  database: D1Database,
  id: string,
  input: Request,
  afterOpen: (version: number) => void,
) {
  await verifyAccess(database, id, input);
  const replay = await platformReplay<Status>(database, input.actor, input.command);
  if (replay) return replay;
  const { current, readiness } = await launchSnapshot(storage, database, id);
  if (current.status === "paused") throw new ApiError("ADMIN_PAUSED", "Магазин приостановлен администратором");
  if (current.status === "active")
    return { id, slug: current.slug, status: "active", version: current.version } as const;
  const override = input.via === "admin" && input.force === true;
  if (!override && readiness.items.some((item) => !item.ready))
    throw new ApiError("NOT_READY", "Завершите обязательные настройки", readiness satisfies LaunchReadiness);
  if (!current.currency) throw new ApiError("VALIDATION", "Выберите валюту в данных магазина");
  if (
    (input.via === "seller" && input.revision !== readiness.revision) ||
    (input.via === "admin" && input.version !== current.version)
  )
    throw new ApiError("VERSION_CONFLICT", "Данные изменились. Обновите экран", readiness);
  const result: Status = { id, slug: current.slug, status: "active", version: current.version + 1 };
  const event = crypto.randomUUID();
  const now = Date.now();
  try {
    const [write] = await database.withSession("first-primary").batch([
      database
        .prepare(`UPDATE shops SET status='active',status_notice=NULL,version=version+1
        WHERE id=? AND version=? AND status='draft' AND ${allowed(input)}`)
        .bind(id, current.version, input.actor),
      database
        .prepare(`INSERT INTO platform_audit(id,shop_id,actor_id,action,changed,created_at)
        SELECT ?,?,?,'shop.status',?,? WHERE changes()=1`)
        .bind(event, id, input.actor, JSON.stringify({ from: "draft", to: "active" }), now),
      database
        .prepare(`INSERT INTO platform_commands(account_id,key,fingerprint,result,created_at)
        SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM platform_audit WHERE id=?)`)
        .bind(input.actor, input.command.key, input.command.fingerprint, JSON.stringify(result), now, event),
    ]);
    if (write.meta.changes === 1) {
      afterOpen(result.version);
      return result;
    }
  } catch (error) {
    await verifyAccess(database, id, input);
    const prior = await platformReplay<Status>(database, input.actor, input.command);
    if (prior) return prior;
    throw error;
  }
  await verifyAccess(database, id, input);
  const latest = await launchSnapshot(storage, database, id);
  if (latest.current.status === "active") return { ...result, version: latest.current.version };
  throw new ApiError("VERSION_CONFLICT", "Данные изменились. Обновите экран", latest.readiness);
}

export type OpenDraftRequest = Request;

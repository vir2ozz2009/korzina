import { ApiError } from "../../../src/shared/errors";
import type { CommandIdentity } from "../../middleware/idempotency";
import { platformReplay } from "../admin/commands";

export type TeamCommand = { shop: string; actor: string; command: CommandIdentity; now: number; manager?: boolean };
export const activeOwner = `EXISTS(SELECT 1 FROM memberships WHERE shop_id=? AND account_id=?
  AND role='owner' AND revoked_at IS NULL)`;
export const notificationManager = `EXISTS(SELECT 1 FROM memberships WHERE shop_id=? AND account_id=?
  AND (role='owner' OR (role='employee' AND team_role='manager')) AND revoked_at IS NULL)`;

async function assertTeamCommand(database: D1Database, { shop, actor, manager }: TeamCommand) {
  const allowed = await database
    .withSession("first-primary")
    .prepare(`SELECT ${manager ? notificationManager : activeOwner} AS allowed`)
    .bind(shop, actor)
    .first<number>("allowed");
  if (!allowed) throw new ApiError("FORBIDDEN", "Недостаточно прав");
}

export async function teamReplay<T>(database: D1Database, context: TeamCommand) {
  await assertTeamCommand(database, context);
  return platformReplay<T>(database, context.actor, context.command);
}

export async function teamMutation<T>(
  database: D1Database,
  context: TeamCommand,
  mutation: D1PreparedStatement,
  action: string,
  changed: unknown,
  result: T,
): Promise<T> {
  const { shop, actor, command, now } = context;
  const event = crypto.randomUUID();
  try {
    const [write] = await database.withSession("first-primary").batch([
      mutation,
      database
        .prepare(`INSERT INTO platform_audit(id,shop_id,actor_id,action,changed,created_at)
        SELECT ?,?,?,?,?,? WHERE changes()=1`)
        .bind(event, shop, actor, action, JSON.stringify(changed), now),
      database
        .prepare(`INSERT INTO platform_commands(account_id,key,fingerprint,result,created_at)
        SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM platform_audit WHERE id=?)`)
        .bind(actor, command.key, command.fingerprint, JSON.stringify(result), now, event),
    ]);
    if (write.meta.changes === 1) return result;
  } catch (error) {
    const replay = await teamReplay<T>(database, context);
    if (replay !== undefined) return replay;
    throw error;
  }
  const replay = await teamReplay<T>(database, context);
  if (replay !== undefined) return replay;
  throw new ApiError("VERSION_CONFLICT", "Данные изменились. Обновите экран");
}

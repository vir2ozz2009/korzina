import { z } from "zod";
import { permissionSchema } from "../../../src/shared/contracts/auth";
import { notificationTopic, teamRole } from "../../../src/shared/contracts/staff";

export const auditFilters = z.object({
  actor: z.string().max(64).optional(),
  section: z.enum(["team", "shop", "owner", "bot"]).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  until: z.coerce.number().int().nonnegative().optional(),
  cursor: z
    .string()
    .regex(/^\d{1,13}:[a-f0-9-]{36}$/)
    .optional(),
});

const access = z.object({ role: teamRole, permissions: permissionSchema.array().optional() });
const change = z.object({
  role: teamRole.optional(),
  topic: notificationTopic.optional(),
  enabled: z.boolean().optional(),
  before: access.optional(),
  after: z.union([access, z.object({ active: z.literal(false) })]).optional(),
  from: z.enum(["draft", "active", "paused"]).optional(),
  to: z.enum(["draft", "active", "paused"]).optional(),
});
type AuditRow = { id: string; actor: string; name: string | null; action: string; createdAt: number; changed: string };

function allowedChange(action: string, raw: string) {
  if (!action.startsWith("team.") && action !== "shop.status") return {};
  try {
    return change.safeParse(JSON.parse(raw)).data ?? {};
  } catch {
    return {};
  }
}

export async function readTeamAudit(database: D1Database, shop: string, filters: z.infer<typeof auditFilters>) {
  const clauses = ["a.shop_id=?"];
  const values: (string | number)[] = [shop];
  if (filters.actor) {
    clauses.push("a.actor_id=?");
    values.push(filters.actor);
  }
  if (filters.section) {
    clauses.push("a.action LIKE ?");
    values.push(`${filters.section}.%`);
  }
  if (filters.from !== undefined) {
    clauses.push("a.created_at>=?");
    values.push(filters.from);
  }
  if (filters.until !== undefined) {
    clauses.push("a.created_at<?");
    values.push(filters.until);
  }
  if (filters.cursor) {
    const [time, id] = filters.cursor.split(":");
    clauses.push("(a.created_at,a.id)<(?,?)");
    values.push(Number(time), id);
  }
  const { results } = await database
    .withSession("first-primary")
    .prepare(`SELECT a.id,a.actor_id AS actor,
    COALESCE(m.display_name,CASE WHEN m.role='owner' THEN s.owner_name END) AS name,
    a.action,a.changed,a.created_at AS createdAt FROM platform_audit a JOIN shops s ON s.id=a.shop_id
    LEFT JOIN memberships m ON m.shop_id=a.shop_id AND m.account_id=a.actor_id
    WHERE ${clauses.join(" AND ")} ORDER BY a.created_at DESC,a.id DESC LIMIT 51`)
    .bind(...values)
    .all<AuditRow>();
  const entries = results.slice(0, 50).map(({ changed, ...row }) => ({
    ...row,
    name: row.name ?? "Система",
    change: allowedChange(row.action, changed),
  }));
  const last = entries.at(-1);
  return { entries, next: results.length > 50 && last ? `${last.createdAt}:${last.id}` : undefined };
}

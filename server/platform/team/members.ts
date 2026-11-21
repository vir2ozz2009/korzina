import { permissionSchema } from "../../../src/shared/contracts/auth";
import { type StaffAccess, staffPermissions, staffRole, type TeamMember } from "../../../src/shared/contracts/staff";
import { ApiError } from "../../../src/shared/errors";
import { effectiveSellerPermissions } from "../../auth/roles";
import { activeOwner, type TeamCommand, teamMutation, teamReplay } from "./mutation";

const memberFields = `SELECT m.account_id AS id,m.role,m.team_role AS teamRole,m.permissions,m.version,
  COALESCE(m.display_name,CASE WHEN m.role='owner' THEN s.owner_name END) AS name
  FROM memberships m JOIN shops s ON s.id=m.shop_id WHERE m.shop_id=? AND m.revoked_at IS NULL`;
const pageSize = 50;
type MemberRow = {
  id: string;
  role: string;
  teamRole: string | null;
  permissions: string;
  version: number;
  name: string | null;
};

function member(row: MemberRow): TeamMember {
  if (row.role === "owner")
    return {
      id: row.id,
      name: row.name || "Владелец",
      role: "owner",
      permissions: [...permissionSchema.options],
      version: row.version,
    };
  return {
    id: row.id,
    name: row.name || "Сотрудник",
    role: staffRole.parse(row.teamRole ?? "custom"),
    permissions: effectiveSellerPermissions(
      permissionSchema.array().parse(JSON.parse(row.permissions)),
      row.teamRole === null,
    ),
    version: row.version,
  };
}

export async function getTeamMember(database: D1Database, shop: string, id: string) {
  const row = await database
    .withSession("first-primary")
    .prepare(`${memberFields} AND m.account_id=?`)
    .bind(shop, id)
    .first<MemberRow>();
  if (!row) throw new ApiError("NOT_FOUND", "Запись не найдена");
  return member(row);
}

export async function getTeam(database: D1Database, shop: string, after = "") {
  const { results } = await database
    .withSession("first-primary")
    .prepare(`${memberFields} AND m.account_id>? ORDER BY m.account_id LIMIT ?`)
    .bind(shop, after, pageSize + 1)
    .all<MemberRow>();
  const members = results.slice(0, pageSize).map(member);
  return { members, next: results.length > pageSize ? members.at(-1)?.id : undefined };
}

async function editableMember(database: D1Database, context: TeamCommand, id: string, version: number) {
  const before = await getTeamMember(database, context.shop, id);
  if (before.role === "owner") throw new ApiError("FORBIDDEN", "Владельца меняет администратор платформы");
  if (before.version !== version) throw new ApiError("VERSION_CONFLICT", "Данные изменились. Обновите экран");
  return before;
}

export async function updateTeamMember(
  database: D1Database,
  context: TeamCommand,
  id: string,
  version: number,
  access: StaffAccess,
) {
  const replay = await teamReplay<TeamMember>(database, context);
  if (replay !== undefined) return replay;
  const before = await editableMember(database, context, id, version);
  const permissions = staffPermissions(access);
  const after = { ...before, role: access.role, permissions, version: version + 1 } satisfies TeamMember;
  const mutation = database
    .prepare(`UPDATE memberships SET team_role=?,permissions=?,version=version+1
    WHERE shop_id=? AND account_id=? AND role='employee' AND revoked_at IS NULL AND version=? AND ${activeOwner}`)
    .bind(access.role, JSON.stringify(permissions), context.shop, id, version, context.shop, context.actor);
  return teamMutation(
    database,
    context,
    mutation,
    "team.access_updated",
    {
      accountId: id,
      before: { role: before.role, permissions: before.permissions },
      after: { role: after.role, permissions: after.permissions },
    },
    after,
  );
}

export async function revokeTeamMember(database: D1Database, context: TeamCommand, id: string, version: number) {
  const replay = await teamReplay<{ id: string }>(database, context);
  if (replay !== undefined) return replay;
  const before = await editableMember(database, context, id, version);
  const mutation = database
    .prepare(`UPDATE memberships SET revoked_at=?,version=version+1
    WHERE shop_id=? AND account_id=? AND role='employee' AND revoked_at IS NULL AND version=? AND ${activeOwner}`)
    .bind(context.now, context.shop, id, version, context.shop, context.actor);
  return teamMutation(
    database,
    context,
    mutation,
    "team.access_revoked",
    {
      accountId: id,
      before: { role: before.role },
      after: { active: false },
    },
    { id },
  );
}

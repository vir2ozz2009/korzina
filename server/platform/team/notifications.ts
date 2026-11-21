import { permissionSchema } from "../../../src/shared/contracts/auth";
import {
  type NotificationTopic,
  notificationTopic,
  staffPermissions,
  type TeamRole,
  teamRole,
} from "../../../src/shared/contracts/staff";
import { ApiError } from "../../../src/shared/errors";
import { effectiveSellerPermissions } from "../../auth/roles";
import { notificationManager, type TeamCommand, teamMutation, teamReplay } from "./mutation";

const requiredPermission = { newOrders: "orders", paymentsAndReceipts: "payments", cancellations: "orders" } as const;
type Person = { telegram: string | null; name: string; role: TeamRole; permitted: string[]; connected: boolean };
type Row = {
  id: string;
  telegram: string | null;
  name: string | null;
  role: string;
  teamRole: string | null;
  permissions: string;
  connected: number;
  recorded: number;
};
type Override = { role: string; topic: string; enabled: number };

function defaultNotification(role: TeamRole, topic: NotificationTopic) {
  return role !== "accountant" || topic === "paymentsAndReceipts";
}

async function readNotificationModel(database: D1Database, shop: string, bot: string, telegram?: string) {
  const session = database.withSession("first-primary");
  const [people, overrides] = await session.batch<Row | Override>([
    database
      .prepare(`SELECT m.account_id AS id,a.telegram_id AS telegram,m.role,m.team_role AS teamRole,m.permissions,
      COALESCE(m.display_name,CASE WHEN m.role='owner' THEN s.owner_name END) AS name,
      EXISTS(SELECT 1 FROM staff_bot_chats b WHERE b.shop_id=m.shop_id AND b.account_id=m.account_id AND b.bot=?) AS connected,
      EXISTS(SELECT 1 FROM staff_bot_chats b WHERE b.shop_id=m.shop_id AND b.account_id=m.account_id) AS recorded
      FROM memberships m JOIN shops s ON s.id=m.shop_id JOIN accounts a ON a.id=m.account_id
      WHERE m.shop_id=? AND m.revoked_at IS NULL AND (a.telegram_id=? OR ? IS NULL)`)
      .bind(bot, shop, telegram ?? null, telegram ?? null),
    database.prepare("SELECT role,topic,enabled FROM staff_role_notifications WHERE shop_id=?").bind(shop),
  ]);
  const members = people.results.flatMap((row) => {
    if (!("id" in row)) return [];
    const role = teamRole.safeParse(row.role === "owner" ? "owner" : (row.teamRole ?? "custom"));
    if (!role.success) return [];
    try {
      const permitted =
        row.role === "owner"
          ? [...permissionSchema.options]
          : effectiveSellerPermissions(
              permissionSchema.array().parse(JSON.parse(row.permissions)),
              row.teamRole === null,
            );
      return [
        {
          name: row.name ?? (row.role === "owner" ? "Владелец" : "Сотрудник"),
          telegram: row.telegram,
          role: role.data,
          permitted,
          connected: !!row.connected || (row.teamRole === null && !row.recorded),
        } satisfies Person,
      ];
    } catch {
      return [];
    }
  });
  const flags = new Map(
    overrides.results.flatMap((row) => ("topic" in row ? [[`${row.role}:${row.topic}`, !!row.enabled] as const] : [])),
  );
  const enabled = (role: TeamRole, topic: NotificationTopic) =>
    flags.get(`${role}:${topic}`) ?? defaultNotification(role, topic);
  return { members, enabled };
}

function canSubscribe(role: TeamRole, topic: NotificationTopic, people: Person[]) {
  const permission = requiredPermission[topic];
  return (
    role === "owner" ||
    (role === "custom"
      ? people.some((person) => person.role === role && person.permitted.includes(permission))
      : staffPermissions({ role }).includes(permission))
  );
}

export async function staffNotificationSettings(database: D1Database, shop: string, bot: string) {
  const { members, enabled } = await readNotificationModel(database, shop, bot);
  const rows = teamRole.options.map((role) => ({
    role,
    topics: notificationTopic.options.map((topic) => {
      const available = canSubscribe(role, topic, members);
      return { topic, available, enabled: available && enabled(role, topic) };
    }),
  }));
  const recipients = notificationTopic.options.map((topic) => ({
    topic,
    names: members
      .filter(
        (person) =>
          person.telegram &&
          person.connected &&
          enabled(person.role, topic) &&
          person.permitted.includes(requiredPermission[topic]),
      )
      .map((person) => person.name)
      .sort(),
  }));
  return { rows, recipients };
}

export async function staffRecipients(database: D1Database, shop: string, bot: string, telegram?: string) {
  const { members, enabled } = await readNotificationModel(database, shop, bot, telegram);
  return members.flatMap((person) =>
    person.telegram && person.connected && person.permitted.includes("orders") && enabled(person.role, "newOrders")
      ? [person.telegram]
      : [],
  );
}

export async function changeNotification(
  database: D1Database,
  context: TeamCommand,
  bot: string,
  input: { role: TeamRole; topic: NotificationTopic; enabled: boolean },
) {
  const actor = { ...context, manager: true };
  const replay = await teamReplay<typeof input>(database, actor);
  if (replay) return replay;
  const model = await readNotificationModel(database, context.shop, bot);
  if (!canSubscribe(input.role, input.topic, model.members)) throw new ApiError("FORBIDDEN", "Нет доступа к разделу");
  const mutation = database
    .prepare(`INSERT INTO staff_role_notifications(shop_id,role,topic,enabled)
    SELECT ?,?,?,? WHERE ${notificationManager} ON CONFLICT(shop_id,role,topic) DO UPDATE SET enabled=excluded.enabled`)
    .bind(context.shop, input.role, input.topic, +input.enabled, context.shop, context.actor);
  return teamMutation(database, actor, mutation, "team.notifications_updated", input, input);
}

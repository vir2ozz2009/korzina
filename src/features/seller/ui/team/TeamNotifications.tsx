import { useQuery } from "@tanstack/react-query";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { type NotificationTopic, notificationTopic } from "../../../../shared/contracts/staff";
import { Card } from "../../../../ui/Card";
import { type Notifications, roleName, teamKey, teamRequest, useStaffBot, useTeamCommand } from "./team-api";

const topicName: Record<NotificationTopic, string> = {
  newOrders: "Новые заказы",
  lowStock: "Товар заканчивается",
  paymentsAndReceipts: "Оплаты и чеки",
  cancellations: "Отмены",
};
export function TeamNotifications({ store }: { store: string }) {
  const bot = useStaffBot(store);
  const query = useQuery({
    queryKey: [...teamKey(store), "notifications"],
    queryFn: ({ signal }) => teamRequest<Notifications>(store, "notifications", { signal }),
    retry: false,
  });
  const update = useTeamCommand(store);
  return (
    <QueryBoundary query={query} template="list">
      {({ rows, recipients }) => (
        <Card>
          {bot.data && (
            <p className="text-small">
              {bot.data.shopBot ? `Бот подключён · @${bot.data.shopBot}` : "Бота подключает администратор Korzina"}
            </p>
          )}
          <table className="w-full table-fixed text-center text-small" aria-label="Уведомления по ролям">
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  Роль
                </th>
                {notificationTopic.options.map((topic) => (
                  <th scope="col" key={topic}>
                    {topicName[topic]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ role, topics }) => (
                <tr key={role} className="border-t border-border">
                  <th scope="row" className="text-left font-medium">
                    {role === "custom" ? "Вручную" : roleName[role]}
                  </th>
                  {topics.map(({ topic, available, enabled }) => (
                    <td key={topic}>
                      <label className="flex min-h-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label={`${roleName[role]} · ${topicName[topic]}`}
                          checked={enabled}
                          disabled={!available || update.isPending}
                          className="size-5 accent-primary disabled:opacity-35"
                          onChange={(event) =>
                            update.mutate({
                              path: "notifications",
                              method: "PUT",
                              body: { role, topic, enabled: event.target.checked },
                            })
                          }
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-small">
            Сейчас получают:{" "}
            {recipients.map(({ topic, names }) => `${topicName[topic]} — ${names.join(", ") || "никто"}`).join(" · ")}
          </p>
          {update.error && <p role="alert">{update.error.message}</p>}
        </Card>
      )}
    </QueryBoundary>
  );
}

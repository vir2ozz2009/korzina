import { Card } from "../../../../ui/Card";
import { useStaffBot } from "./team-api";

export function ReconnectStaffBot({ store }: { store: string }) {
  const { data } = useStaffBot(store);
  if (!data?.reconnect) return null;
  return (
    <Card>
      <a href={data.reconnect} className="text-primary-text">
        Бот магазина сменился — нажмите, чтобы снова получать уведомления
      </a>
    </Card>
  );
}

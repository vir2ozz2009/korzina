import { StatusPill } from "../../../ui/StatusPill";

const names = { draft: "Черновик", active: "Открыт", paused: "Пауза" } as const;

export function AdminStatus({ status }: { status: keyof typeof names }) {
  return (
    <StatusPill tone={status === "active" ? "success" : status === "paused" ? "warning" : "neutral"}>
      {names[status]}
    </StatusPill>
  );
}

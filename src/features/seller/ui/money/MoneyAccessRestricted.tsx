import { LockKeyhole } from "lucide-react";
import { HttpError } from "../../../../shared/http-error";
import { EmptyState } from "../../../../ui/EmptyState";

export function isMoneyForbidden(error: unknown) {
  return error instanceof HttpError && error.status === 403;
}

export function MoneyAccessRestricted() {
  return (
    <div role="alert">
      <EmptyState title="Доступ ограничен" icon={<LockKeyhole size={48} />} />
    </div>
  );
}

import { useEffect } from "react";
import { isTimeAvailable } from "../../shared/receiving-hours";
import { type ReceivingState, useAvailability, useSaveTime } from "./api";

export function useReceivingTime(data: ReceivingState | undefined, enabled = true) {
  const schedule = useAvailability(enabled ? data?.receiving?.mode : undefined);
  const { mutate, variables, isPending, error, reset } = useSaveTime();
  const saved = data?.time ?? null;
  const revision = data?.revision;
  const invalid = !!(saved && schedule.data && !isTimeAvailable(schedule.data.mode, schedule.data.days, saved));
  const checked = schedule.isSuccess && !schedule.isFetching;
  const clearedRevision = variables?.expectedRevision;

  useEffect(() => {
    // The cart revision protects a newer choice made while the schedule was being checked.
    if (checked && invalid && !isPending && revision !== undefined && clearedRevision !== revision)
      mutate({ expectedRevision: revision, time: null });
  }, [checked, clearedRevision, invalid, isPending, mutate, revision]);

  return {
    schedule,
    time: invalid ? null : saved,
    changed: invalid || (!saved && !!variables),
    needsTime: schedule.data?.mode !== "after_order" && (invalid || !saved),
    checking: schedule.isPending || schedule.isFetching || isPending || (invalid && !error),
    error: error ?? (schedule.isError ? schedule.error : null),
    retry() {
      reset();
      return schedule.refetch();
    },
  };
}

export const workdayStages = ["placed", "accepted", "ready", "handed"] as const;
export const workdayActions = ["accept", "receipt", "payment", "overdue"] as const;
export const workdayFocuses = [...workdayStages, ...workdayActions, "debt"] as const;

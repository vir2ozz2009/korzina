export const search = (input: Record<string, unknown>): { store?: string } => ({
  store: typeof input.store === "string" && /^[a-z0-9-]{1,63}$/.test(input.store) ? input.store : undefined,
});
export const day = (input: unknown) => {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(input)) return undefined;
  const parsed = new Date(`${input}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(input) ? input : undefined;
};

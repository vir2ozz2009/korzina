import { isFeatureKey } from "../src/shared/flags.ts";

export function flagOptions(args: string[]) {
  const local = args.includes("--local");
  const values = args.filter((arg) => arg !== "--local");
  const [shop, key, state] = values;
  if (
    values.length !== 3 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(shop ?? "") ||
    !isFeatureKey(key ?? "") ||
    !["on", "off"].includes(state)
  ) {
    throw new Error("Использование: npm run flag -- <slug> <key из flags.ts> on|off [--local]");
  }
  return { shop, key, enabled: state === "on", local };
}

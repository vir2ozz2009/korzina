import { environmentResources } from "../server/platform/config.ts";

export function platformTarget(local: boolean, preview: boolean, branch: string) {
  if (!local && !preview && branch !== "main") {
    throw new Error("Demo D1 меняет только main; для ветки используйте --preview");
  }
  return environmentResources(preview).database;
}

export function assertDatabaseTarget(args: string[], databaseId: string) {
  const id = args[1] === "raw" ? args[2] : args[1] === "migrations" ? args[3] : undefined;
  if (args[0] === "d1" && id !== databaseId) throw new Error("Команда D1 указывает на другое окружение");
}

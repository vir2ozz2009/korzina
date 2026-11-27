import { environmentResources } from "../server/platform/config.ts";

export function platformTarget(local: boolean, preview: boolean, branch: string, production = false) {
  if (production && (local || preview)) throw new Error("Prod несовместим с local/preview");
  if (production && branch !== "main") throw new Error("Prod D1 меняет только main");
  if (!local && !preview && branch !== "main") {
    throw new Error("Demo D1 меняет только main; для ветки используйте --preview");
  }
  return environmentResources(preview, production).database;
}

export function assertDatabaseTarget(args: string[], databaseId: string) {
  const id = args[1] === "raw" ? args[2] : args[1] === "migrations" ? args[3] : undefined;
  if (args[0] === "d1" && id !== databaseId) throw new Error("Команда D1 указывает на другое окружение");
}

export function assertSetupOptions(local: boolean, preview: boolean, production: boolean, seed: boolean) {
  if (production && (local || preview || seed)) throw new Error("Prod: local/preview/seed запрещены");
}

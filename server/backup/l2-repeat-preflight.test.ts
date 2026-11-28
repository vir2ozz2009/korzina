import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import repeat from "../../scripts/l2-drill/repeat-worker";

it("rejects missing training identities before deleting marker or writing a backup", async () => {
  const marker = ".l2-drill-identity";
  await env.MEDIA.put(marker, "korzina-l2-drill-b-private");
  const before = (await env.BACKUPS.list()).objects.map((object) => object.key);
  const request = new Request("https://training.invalid/", {
    method: "POST",
    headers: { Authorization: "Bearer test-token" },
  });
  const training = { ...env, APP_ENV: "l2-drill" as Env["APP_ENV"], DRILL_TOKEN: "test-token" };
  await expect(repeat.fetch(request, training)).rejects.toThrow(/database schema mismatch/);
  expect(await (await env.MEDIA.get(marker))?.text()).toBe("korzina-l2-drill-b-private");
  expect((await env.BACKUPS.list()).objects.map((object) => object.key)).toEqual(before);
});

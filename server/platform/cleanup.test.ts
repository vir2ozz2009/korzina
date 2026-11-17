import { runInDurableObject } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { beforeAll, expect, it, vi } from "vitest";
import { setupPlatform } from "../testing/platform";
import { cleanupSellers, platformCleanupId, scheduleSellerCleanup } from "./cleanup";

beforeAll(setupPlatform);
it("координатор убирает только истёкшие seller_sessions; две SQL и снятие аларма после последней записи", async () => {
  const now = Date.now();
  await env.PLATFORM.prepare("INSERT INTO accounts(id) VALUES('cleanup-account')").run();
  await env.PLATFORM.prepare(
    "INSERT INTO seller_sessions VALUES('old','cleanup-account',?),('fresh','cleanup-account',?)",
  )
    .bind(now - 1, now + 100000)
    .run();
  await scheduleSellerCleanup();
  const stub = exports.Shop.get(exports.Shop.idFromName(platformCleanupId));
  await runInDurableObject(stub, async (_instance, ctx) => {
    const queries = vi.spyOn(env.PLATFORM, "prepare");
    try {
      await cleanupSellers(env.PLATFORM, ctx.storage, now);
      expect(queries).toHaveBeenCalledTimes(2);
    } finally {
      queries.mockRestore();
    }
    expect(
      await env.PLATFORM.prepare("SELECT token_hash FROM seller_sessions ORDER BY token_hash").all(),
    ).toMatchObject({ results: [{ token_hash: "fresh" }] });
    expect(await ctx.storage.getAlarm()).toBeGreaterThan(now);
    await cleanupSellers(env.PLATFORM, ctx.storage, now + 100001);
    expect(await ctx.storage.getAlarm()).toBeNull();
  });
});

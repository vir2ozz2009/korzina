import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { setupPlatform } from "../../testing/platform";
import { startEmail, verifyEmail } from "./email";

beforeAll(setupPlatform);
describe("email-коды", () => {
  it("пять неверных попыток блокируют код, исходный код в D1 не хранится", async () => {
    const challenge = await startEmail(env.PLATFORM, "attempts@korzina.invalid");
    const stored = await env.PLATFORM.prepare("SELECT code_hash FROM email_challenges WHERE id = ?")
      .bind(challenge.challengeId)
      .first();
    expect(JSON.stringify(stored)).not.toContain(challenge.devCode);
    const wrong = challenge.devCode === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++)
      await expect(verifyEmail(env.PLATFORM, challenge.challengeId, wrong)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    await expect(verifyEmail(env.PLATFORM, challenge.challengeId, challenge.devCode)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("просроченный код не входит; одновременное погашение создаёт одну сессию", async () => {
    const expired = await startEmail(env.PLATFORM, "expired@korzina.invalid");
    await env.PLATFORM.prepare("UPDATE email_challenges SET expires_at = 0 WHERE id = ?")
      .bind(expired.challengeId)
      .run();
    await expect(verifyEmail(env.PLATFORM, expired.challengeId, expired.devCode)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const challenge = await startEmail(env.PLATFORM, "race@korzina.invalid");
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => verifyEmail(env.PLATFORM, challenge.challengeId, challenge.devCode)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
});

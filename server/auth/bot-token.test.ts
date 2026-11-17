import { describe, expect, it } from "vitest";
import { decryptBotToken, encryptBotToken } from "./bot-token";

const secret = "a1".repeat(32); // Synthetic test key.
describe("зашифрованный токен бота магазина", () => {
  it("восстанавливается только своим магазином и ключом; повреждение закрывает вход", async () => {
    const token = "12345:synthetic-test-only";
    const cipher = await encryptBotToken(token, "shop-a", secret);
    expect(cipher).not.toContain(token);
    expect(await decryptBotToken(cipher, "shop-a", secret)).toBe(token);
    await expect(decryptBotToken(cipher, "shop-b", secret)).rejects.toMatchObject({ code: "AUTH_UNAVAILABLE" });
    await expect(decryptBotToken(cipher, "shop-a", "b2".repeat(32))).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    });
    await expect(decryptBotToken(`${cipher}broken`, "shop-a", secret)).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    });
  });
});

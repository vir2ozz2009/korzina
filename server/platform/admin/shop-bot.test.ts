import { env } from "cloudflare:workers";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { setupPlatformDatabase } from "../../testing/platform";
import { botFixtureKey } from "../../testing/shop-bot";
import { botWebhookSecret, changeShopBot, managedBot } from "./shop-bot";
import { managedShop } from "./shop-detail";

beforeAll(setupPlatformDatabase);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const db = env.PLATFORM;
const shopId = "korzina-demo-lavka";
const token = "92222:synthetic-shop-bot-fixture";
const origin = "https://demo.korzina.app";
const privateResponse = "raw Telegram response";
const success = (result: unknown = true) => Response.json({ ok: true, result });
const botDetails = { id: 92222, username: "KorzinaStoreFixtureBot", is_bot: true };

async function connect(key = botFixtureKey) {
  const { version } = await managedShop(db, shopId);
  const mutation = {
    id: shopId,
    actor: "admin-fixture",
    version,
    command: { key: crypto.randomUUID(), fingerprint: crypto.randomUUID() },
  };
  return changeShopBot(db, { ENCRYPTION_KEY: key }, mutation, { action: "connect", version, token }, origin);
}

function mockTelegram(reply: (method: string, signal: AbortSignal | null | undefined) => Response | Promise<Response>) {
  const methods: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const method = new URL(url).pathname.split("/").at(-1) ?? "";
    methods.push(method);
    return reply(method, init.signal);
  });
  return methods;
}

async function expectFailure(
  attempt: Promise<unknown>,
  log: ReturnType<typeof captureLog>,
  code: string,
  { stage, kind, httpStatus }: { stage: string; kind?: string; httpStatus?: number },
  responseCode = code,
) {
  await expect(attempt).rejects.toMatchObject({ code: responseCode });
  expect(log).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ event: "shop_bot_connect_failed", shopId, stage, code, kind, httpStatus }),
  );
  expect(await managedBot(db, shopId)).toBeNull();
}

function captureLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

it("пишет статус Telegram при отклонении токена и сохраняет код ошибки формы", async () => {
  const log = captureLog();
  const methods = mockTelegram(() => Response.json({ ok: false, description: privateResponse }, { status: 401 }));
  await expectFailure(
    connect(),
    log,
    "AUTH_FAILED",
    { stage: "getMe", kind: "http", httpStatus: 401 },
    "TOKEN_INVALID",
  );
  expect(methods).toEqual(["getMe"]);
});

it.each(["timeout", "network"] as const)(
  "ограничивает повтор getMe при %s и сохраняет этап в журнале",
  async (kind) => {
    const log = captureLog();
    if (kind === "timeout") vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    const methods = mockTelegram((_method, signal) => {
      if (signal?.aborted) throw signal.reason;
      throw new TypeError(privateResponse);
    });
    await expectFailure(connect(), log, "AUTH_UNAVAILABLE", { stage: "getMe", kind });
    expect(methods).toEqual(["getMe", "getMe"]);
  },
);

it("указывает подготовку ключа, когда Telegram уже подтвердил токен", async () => {
  const log = captureLog();
  const methods = mockTelegram(() => success(botDetails));
  await expectFailure(connect("invalid-key"), log, "AUTH_UNAVAILABLE", { stage: "prepare_encryption_key" });
  expect(methods).toEqual(["getMe"]);
});

it.each(["timeout", "network"] as const)("различает %s до получения ответа на setWebhook", async (kind) => {
  const log = captureLog();
  if (kind === "timeout") vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
  const secret = await botWebhookSecret(botFixtureKey, shopId, String(botDetails.id));
  mockTelegram((method, signal) => {
    if (method === "getMe") return success(botDetails);
    if (signal?.aborted) throw signal.reason;
    throw new TypeError(`https://api.telegram.org/bot${token}/${method} ${secret} ${privateResponse}`);
  });
  await expectFailure(connect(), log, "AUTH_UNAVAILABLE", { stage: "setWebhook", kind });
});

it("сохраняет HTTP-статус ответа setWebhook с телом, которое не разбирается как JSON", async () => {
  const log = captureLog();
  mockTelegram((method) => (method === "getMe" ? success(botDetails) : new Response(privateResponse)));
  await expectFailure(connect(), log, "AUTH_UNAVAILABLE", {
    stage: "setWebhook",
    kind: "invalid_response",
    httpStatus: 200,
  });
});

it("откатывает webhook и не сохраняет привязку, если Telegram не подтвердил установку меню", async () => {
  const log = captureLog();
  const methods = mockTelegram((method) => {
    if (method === "getMe") return success(botDetails);
    return success(method !== "setChatMenuButton");
  });
  await expectFailure(connect(), log, "AUTH_UNAVAILABLE", {
    stage: "setChatMenuButton",
    kind: "invalid_response",
    httpStatus: 200,
  });
  expect(methods).toEqual(["getMe", "setWebhook", "setChatMenuButton", "deleteWebhook"]);
});

it("указывает сохранение привязки, когда версия магазина меняется после настройки Telegram", async () => {
  const log = captureLog();
  const methods = mockTelegram(async (method) => {
    if (method === "getMe") return success(botDetails);
    if (method === "setChatMenuButton")
      await db.prepare("UPDATE shops SET version=version+1 WHERE id=?").bind(shopId).run();
    return success();
  });
  await expectFailure(connect(), log, "VERSION_CONFLICT", { stage: "save_binding" });
  expect(methods).toEqual(["getMe", "setWebhook", "setChatMenuButton", "deleteWebhook"]);
});

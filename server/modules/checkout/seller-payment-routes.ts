import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { saveSellerPayments } from "../../../src/shared/contracts/seller-payments";
import { ApiError } from "../../../src/shared/errors";
import { validationFailure } from "../../auth/request";
import { checkSettingsAccess, readSeller } from "../../auth/roles";
import { idempotency } from "../../middleware/idempotency";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { canEditPayments, readSellerPayments, updateSellerPayments } from "./seller-payments";

export const sellerPaymentRoutes = new Hono<ShopEnv>()
  .get("/settings", async (c) => {
    c.header("Cache-Control", "private, no-store");
    const seller = await readSeller(c.req.raw, c.env.platform, c.env.shop.id);
    checkSettingsAccess(seller);
    return c.json(readSellerPayments(c.env, seller));
  })
  .put(
    "/settings",
    bodyLimit({
      maxSize: 262_144,
      onError: () => {
        throw new ApiError("PAYLOAD_TOO_LARGE", "Слишком большой запрос");
      },
    }),
    idempotency,
    zValidator("json", saveSellerPayments, validationFailure),
    async (c) => {
      c.header("Cache-Control", "private, no-store");
      const { storage, db, platform, shop } = c.env;
      const seller = await readSeller(c.req.raw, platform, shop.id);
      if (!canEditPayments(seller)) throw new ApiError("FORBIDDEN", "Нет права изменять способы оплаты");
      const { body } = executeCommand(storage, db, `seller:payments:${seller.accountId}`, c.get("command"), () => ({
        status: 200,
        body: updateSellerPayments(c.env, seller, c.req.valid("json")),
      }));
      return c.json(body);
    },
  );

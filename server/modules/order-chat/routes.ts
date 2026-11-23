import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { orderNumberInput } from "../../../src/shared/contracts/buyer-order";
import {
  chatHistoryInput,
  chatListInput,
  chatReadInput,
  chatSendInput,
} from "../../../src/shared/contracts/order-chat";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { readSeller } from "../../auth/roles";
import type { ShopEnv } from "../../shop/env";
import { mediaPrefix } from "../media/objects";
import { type ChatActor, chatBuyer, chatOrder, chatSeller } from "./access";
import { orderChatHistory, orderChatList } from "./read";
import { markChatRead, sendChatMessage } from "./write";

type ChatEnv = ShopEnv & { Variables: ShopEnv["Variables"] & { actor: ChatActor } };
const params = zValidator("param", z.object({ number: orderNumberInput }), validationFailure);

function routes(authenticate: (env: ShopEnv["Bindings"], request: Request) => Promise<ChatActor>) {
  return new Hono<ChatEnv>()
    .use("*", async (c, next) => {
      c.header("Cache-Control", "private, no-store");
      c.set("actor", await authenticate(c.env, c.req.raw));
      await next();
    })
    .get("/", zValidator("query", chatListInput, validationFailure), (c) =>
      c.json(orderChatList(c.env.storage, c.get("actor"), c.req.valid("query").cursor)),
    )
    .get("/:number", params, zValidator("query", chatHistoryInput, validationFailure), (c) =>
      c.json(orderChatHistory(c.env.storage, c.get("actor"), c.req.valid("param").number, c.req.valid("query"))),
    )
    .post("/:number", authBodyLimit, authCommand, params, zValidator("json", chatSendInput, validationFailure), (c) =>
      c.json(
        sendChatMessage(c.env, c.get("actor"), c.req.valid("param").number, c.req.valid("json"), c.get("command")),
      ),
    )
    .post(
      "/:number/read",
      authBodyLimit,
      authCommand,
      params,
      zValidator("json", chatReadInput, validationFailure),
      (c) => c.json(markChatRead(c.env, c.get("actor"), c.req.valid("param").number, c.req.valid("json").through)),
    )
    .get(
      "/:number/photos/:id",
      zValidator("param", z.object({ number: orderNumberInput, id: z.uuid() }), validationFailure),
      async (c) => {
        const { number, id } = c.req.valid("param");
        chatOrder(c.env.storage, number, c.get("actor"));
        const attached = c.env.storage.sql
          .exec(
            `SELECT 1 FROM buyer_order_events e JOIN media m ON m.id=json_extract(e.details,'$.mediaId')
           WHERE e.order_number=? AND e.event IN ('chat.buyer','chat.seller') AND json_extract(e.details,'$.mediaId')=?
             AND m.status='attached' AND m.ready=1`,
            number,
            id,
          )
          .toArray().length;
        if (!attached) throw new ApiError("NOT_FOUND", "Фото недоступно");
        const file = await c.env.media.MEDIA.get(`${mediaPrefix(c.env.shop.id, id)}original.webp`);
        if (!file) throw new ApiError("NOT_FOUND", "Фото недоступно");
        c.header("Content-Type", "image/webp");
        c.header("X-Content-Type-Options", "nosniff");
        return c.body(file.body);
      },
    );
}

export const buyerChatRoutes = routes(chatBuyer);
export const sellerChatRoutes = routes(async (env, request) =>
  chatSeller(await readSeller(request, env.platform, env.shop.id)),
);

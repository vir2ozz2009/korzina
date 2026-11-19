import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { addressCommand, profileInput } from "../../../src/shared/contracts/profile";
import { ApiError } from "../../../src/shared/errors";
import { authBodyLimit, authCommand, validationFailure } from "../../auth/request";
import { executeCommand } from "../../shop/commands";
import type { ShopEnv } from "../../shop/env";
import { contactRegion } from "../auth/contact";
import { readCustomer } from "../auth/service";
import { editableProfile, editProfile, profileAddresses, updateProfileAddress } from "./service";

async function actor(env: ShopEnv["Bindings"], request: Request) {
  const session = await readCustomer(env.db, request, env.shop.id);
  if (!session) throw new ApiError("UNAUTHORIZED", "Войдите в магазин");
  return session;
}

export const profileRoutes = new Hono<ShopEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  })
  .get("/", async (c) =>
    c.json({
      ...editableProfile(c.env.storage, await actor(c.env, c.req.raw)),
      region: contactRegion(c.env.storage),
    }),
  )
  .post("/", authBodyLimit, authCommand, zValidator("json", profileInput, validationFailure), async (c) => {
    const session = await actor(c.env, c.req.raw);
    const { storage, db } = c.env;
    const { body } = executeCommand(storage, db, `profile:${session.subject}`, c.get("command"), () => ({
      status: 200,
      body: editProfile(storage, session, c.req.valid("json")),
    }));
    return c.json(body);
  })
  .get("/addresses", async (c) => c.json(profileAddresses(c.env.storage, await actor(c.env, c.req.raw))))
  .post("/addresses", authBodyLimit, authCommand, zValidator("json", addressCommand, validationFailure), async (c) => {
    const session = await actor(c.env, c.req.raw);
    const { storage, db, features } = c.env;
    const { body } = executeCommand(storage, db, `addresses:${session.subject}`, c.get("command"), () => ({
      status: 200,
      body: updateProfileAddress(storage, session, c.req.valid("json"), features.maps),
    }));
    return c.json(body);
  });

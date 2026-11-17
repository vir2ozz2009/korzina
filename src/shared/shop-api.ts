import { bootstrap } from "../app/bootstrap";
import { api, apiForShop } from "./api";

export const shopApi = bootstrap ? apiForShop(bootstrap.slug) : api;
export const shopKey = bootstrap?.id ?? "unknown";
export const commandHeaders = (key: string = crypto.randomUUID()) => ({ "Idempotency-Key": key });

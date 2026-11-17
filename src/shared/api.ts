import { hc } from "hono/client";
import type { AppType } from "../../server/index";

// Type-only server import is erased from the browser bundle.
export const api = hc<AppType>("/");

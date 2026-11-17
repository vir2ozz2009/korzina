import { z } from "zod";

// A harmless demo-only command exercises the infrastructure before business modules exist.
export const echoInput = z.strictObject({ value: z.string().max(200) });

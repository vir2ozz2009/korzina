import { z } from "zod";

const launchRevision = z.string().regex(/^[a-f0-9]{64}$/u);
export const openDraftInput = z.strictObject({ revision: launchRevision });
export const launchReadiness = z.strictObject({
  status: z.enum(["draft", "active", "paused"]),
  revision: launchRevision,
  items: z.array(z.strictObject({ key: z.enum(["name", "product", "receiving", "payment"]), ready: z.boolean() })),
});
export type LaunchReadiness = z.infer<typeof launchReadiness>;
export type ReadinessItem = LaunchReadiness["items"][number];

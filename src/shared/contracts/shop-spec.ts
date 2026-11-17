import { z } from "zod";
import { mediaSpec } from "./media";

export const shopSpec = z.object({ media: z.array(mediaSpec).describe("Фото и файлы магазина") });

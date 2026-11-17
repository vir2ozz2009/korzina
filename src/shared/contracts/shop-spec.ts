import { z } from "zod";
import { catalogSpec } from "./catalog-spec.ts";
import { mediaSpec } from "./media.ts";

export const shopSpec = z.object({
  media: z.array(mediaSpec).describe("Фото и файлы магазина"),
  catalog: catalogSpec.describe("Каталог товаров, фасовок, категорий и брендов"),
});

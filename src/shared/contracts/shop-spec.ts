import { z } from "zod";
import { catalogSpec } from "./catalog-spec.ts";
import { mediaSpec } from "./media.ts";
import { saveReceivingHours } from "./seller-receiving.ts";

export const shopSpec = z.object({
  media: z.array(mediaSpec).describe("Фото и файлы магазина"),
  catalog: catalogSpec.describe("Каталог товаров, фасовок, категорий и брендов"),
  receivingHours: saveReceivingHours
    .omit({ expectedRevision: true })
    .optional()
    .describe(
      "Часы получения заказов: общие часы delivery, необязательные отдельные часы pickup и даты закрытия closedDates",
    ),
});

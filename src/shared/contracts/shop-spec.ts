import { z } from "zod";
import { catalogSpec } from "./catalog-spec.ts";
import { mediaSpec } from "./media.ts";
import { promoTerms } from "./promo.ts";
import { saveReceivingHours } from "./seller-receiving.ts";

export const shopSpec = z.object({
  media: z.array(mediaSpec).describe("Фото и файлы магазина"),
  catalog: catalogSpec.describe("Каталог товаров, фасовок, категорий и брендов"),
  promotions: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .describe("Стабильный id предложения; auto-delivery — единственная автоматическая доставка"),
        terms: promoTerms.describe(
          "Условия акции; delivery=true означает бесплатную доставку, kind=code требует непустой код",
        ),
      }),
    )
    .optional()
    .describe(
      "Предложения Продвижения. Базовый тариф хранится отдельно в настройках получения; порог и срок доставки — в одной записи акции",
    ),
  receivingHours: saveReceivingHours
    .omit({ expectedRevision: true })
    .optional()
    .describe(
      "Часы получения заказов: общие часы delivery, необязательные отдельные часы pickup и даты закрытия closedDates",
    ),
});

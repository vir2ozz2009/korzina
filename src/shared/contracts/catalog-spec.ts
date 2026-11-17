import { z } from "zod";

const key = z.string().min(1).max(120);
const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const catalogSpec = z.object({
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .describe("Валюта магазина, код ISO 4217"),
  hideOutOfStock: z.boolean().describe("Скрывать товары без остатка вместо отметки «Нет в наличии»"),
  categories: z
    .array(
      z.object({
        key: key.describe("Стабильный ключ категории"),
        name: z.string().min(1).describe("Название категории"),
        parentKey: key.nullable().describe("Ключ родительской категории; null для корневой"),
        visible: z.boolean().describe("Показывать категорию в навигации"),
        photoKey: key.nullable().describe("Ключ фото категории из media; null — первое фото товара"),
      }),
    )
    .describe("Категории и подкатегории в порядке показа"),
  brands: z
    .array(
      z.object({
        key: key.describe("Стабильный ключ бренда"),
        name: z.string().min(1).describe("Название бренда"),
        visible: z.boolean().describe("Показывать бренд в навигации"),
      }),
    )
    .describe("Бренды магазина в порядке показа"),
  products: z
    .array(
      z.object({
        key: key.describe("Стабильный ключ товара и адрес карточки"),
        name: z.string().min(1).describe("Название товара"),
        description: z.string().describe("Полное описание товара"),
        categoryKey: key.describe("Ключ категории товара"),
        brandKey: key.nullable().describe("Ключ бренда; null, если бренда нет"),
        published: z.boolean().describe("Опубликован ли товар"),
        visible: z.boolean().describe("Показывать ли товар покупателю"),
        photoKeys: z.array(key).describe("Ключи фото из media по порядку; первое — обложка"),
        variants: z
          .array(
            z.object({
              key: key.describe("Стабильный ключ фасовки (SKU)"),
              name: z.string().min(1).describe("Фасовка: например, 250 г или 1 шт."),
              priceMinor: minor.describe("Цена целым числом в минимальных единицах валюты"),
              oldPriceMinor: minor.nullable().describe("Старая цена в минимальных единицах; null без скидки"),
              stock: minor.nullable().describe("Доступное количество; null — без учёта остатка"),
              visible: z.boolean().describe("Показывать фасовку покупателю"),
              photoKey: key.nullable().describe("Ключ фото фасовки из фото товара; null — обложка товара"),
            }),
          )
          .min(1)
          .describe("Фасовки товара в порядке показа"),
      }),
    )
    .describe("Товары магазина в порядке показа"),
});

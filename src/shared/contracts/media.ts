import { z } from "zod";

export const mediaPurpose = z.enum(["product", "logo", "cover", "payment_qr", "receipt", "chat", "review", "refund"]);
export type MediaPurpose = z.infer<typeof mediaPurpose>;
export const publicPurposes: readonly MediaPurpose[] = ["product", "logo", "cover", "payment_qr"];
export const mediaWidths = [160, 400, 800, 1600] as const;
export const maxMediaBytes = 10 * 1024 * 1024;
export const defaultStorageLimit = 2 * 1024 * 1024 * 1024;

export const mediaSpec = z.object({
  key: z.string().describe("Стабильный ключ файла в спецификации магазина"),
  purpose: mediaPurpose.describe("Назначение файла"),
  source: z.string().url().describe("Исходная ссылка на фото для импорта"),
});

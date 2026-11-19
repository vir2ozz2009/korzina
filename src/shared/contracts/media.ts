import { z } from "zod";

export const mediaPurpose = z.enum(["product", "logo", "cover", "payment_qr", "receipt", "chat", "review", "refund"]);
export type MediaPurpose = z.infer<typeof mediaPurpose>;
export const publicPurposes: readonly MediaPurpose[] = ["product", "logo", "cover", "payment_qr"];
export const mediaWidths = [160, 400, 800, 1600] as const;
export const maxMediaBytes = 10 * 1024 * 1024;

const contentBoxContract = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().positive().max(1),
    h: z.number().positive().max(1),
  })
  .refine((box) => box.x + box.w <= 1.000001 && box.y + box.h <= 1.000001, "Рамка выходит за фото");
export type ContentBox = z.infer<typeof contentBoxContract>;
export const cropPositionContract = z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
export type CropPosition = z.infer<typeof cropPositionContract>;
export const photoMetadataContract = z.object({
  edgeColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional()
    .describe("Средний цвет краёв фото, вычисленный при загрузке"),
  contentBox: contentBoxContract.optional().describe("Рамка предмета x/y/w/h в долях исходного фото"),
  width: z.number().int().positive().max(65536).optional().describe("Ширина исходника в пикселях"),
  height: z.number().int().positive().max(65536).optional().describe("Высота исходника в пикселях"),
});
export type PhotoMetadata = z.infer<typeof photoMetadataContract>;

export const mediaSpec = z.object({
  key: z.string().describe("Стабильный ключ файла в спецификации магазина"),
  purpose: mediaPurpose.describe("Назначение файла"),
  ...photoMetadataContract.shape,
  source: z.string().url().describe("Исходная ссылка на фото для импорта"),
});

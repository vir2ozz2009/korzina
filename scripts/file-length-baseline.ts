// Shrink these ceilings as files are split. Remove an entry once it fits in 250 lines.
export const fileLengthBaseline: Readonly<Record<string, number>> = {
  "server/modules/fulfillment/seller-settings.test.ts": 284,
  "server/modules/seller-orders/orders.test.ts": 274,
  "server/platform/schema.ts": 251,
  "src/features/checkout/ui/PaymentScreen.tsx": 254,
  "src/features/seller/ui/catalog/CatalogActions.tsx": 287,
  "src/features/seller/ui/catalog/SellerCatalogScreen.tsx": 255,
  "src/features/seller/ui/orders/SellerOrdersList.tsx": 290,
  "src/features/seller/ui/workday/WorkdayScreens.tsx": 272,
};

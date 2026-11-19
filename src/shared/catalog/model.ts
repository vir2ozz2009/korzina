import type { CatalogOffer, CatalogTile } from "../contracts/catalog";

// A public snapshot never supplies a price or stock. Missing/tombstoned offers disappear.
export function storefrontProducts(items: CatalogTile[], offers: CatalogOffer[]) {
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  return items.flatMap((product) => {
    const variants = product.variants.flatMap((variant) => {
      const offer = byId.get(variant.id);
      return offer?.visible && offer.productId === product.id && offer.priceMinor !== null
        ? [{ ...variant, ...offer, priceMinor: offer.priceMinor }]
        : [];
    });
    return variants.length ? [{ ...product, variants }] : [];
  });
}
export type StorefrontProduct = ReturnType<typeof storefrontProducts>[number];

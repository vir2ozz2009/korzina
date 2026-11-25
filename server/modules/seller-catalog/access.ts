import type { Seller } from "../../auth/roles";

export function writesSellerCatalog(seller: Seller) {
  return seller.role === "owner" || seller.permissions.includes("products");
}

export function readsSellerCatalog(seller: Seller) {
  return writesSellerCatalog(seller) || !seller.teamRole;
}

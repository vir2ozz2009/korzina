import type { ShopInfo } from "../../src/shared/contracts/shop";
import { ApiError } from "../../src/shared/errors";
import { cookieValue, sellerCookie } from "../auth/cookies";
import { readSellerSession } from "../auth/roles";
import { tokenHash } from "../auth/tokens";

const previewSessionHeader = "x-korzina-preview-session";
export const previewShopHeader = "x-korzina-preview-shop";

export async function hasTeamAccess(
  request: Request,
  platform: D1Database,
  shop: Pick<ShopInfo, "id">,
): Promise<boolean> {
  // Buyer authorization stays independent. The embedded cabinet sends its own seller credential.
  const token = request.headers.get(previewSessionHeader) ?? cookieValue(request, sellerCookie);
  if (!token || !/^[a-f0-9]{64}$/u.test(token)) return false;
  try {
    await readSellerSession(platform, await tokenHash(token), shop.id);
    return true;
  } catch (error) {
    if (error instanceof ApiError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) return false;
    throw error;
  }
}

export async function authorizeBuyerShop(request: Request, platform: D1Database, shop: ShopInfo) {
  if (shop.status !== "draft") return false;
  if (await hasTeamAccess(request, platform, shop)) return true;
  throw new ApiError("SHOP_NOT_FOUND", "Магазин скоро откроется");
}

import { beforeAll, expect, it } from "vitest";
import { storefrontProducts } from "../../../src/shared/catalog/model";
import { selectOffer } from "../../../src/shared/catalog/offer";
import {
  catalogDocumentContract,
  catalogListContract,
  catalogOffersContract,
} from "../../../src/shared/contracts/catalog";
import { getAuth } from "../../testing/auth";
import { beforeFrozenClock } from "../../testing/clock";
import { setupPlatform } from "../../testing/platform";

beforeFrozenClock();
beforeAll(setupPlatform);

const read = async (path: string) => {
  const response = await getAuth(`/api/catalog/${path}&shop=test2`);
  expect(response.status).toBe(200);
  return response.json();
};

function project(
  document: ReturnType<typeof catalogDocumentContract.parse>,
  offers: ReturnType<typeof catalogOffersContract.parse>,
) {
  const tiles = storefrontProducts(document.items, offers.items).map(({ id, variants }) => {
    const { variant, multiple, from } = selectOffer(variants, [], id);
    return {
      sku: variant.id,
      price: variant.priceMinor,
      available: variant.available,
      variants: variants.length,
      badges: {
        soldOut: !variant.available,
        discount: variant.oldPriceMinor !== null && variant.oldPriceMinor > variant.priceMinor,
        multiple,
        from,
      },
    };
  });
  return {
    categories: document.categories.filter((item) => !item.parentId && item.hasProducts).map(({ id }) => id),
    brands: document.brands.filter((item) => item.hasProducts).map(({ id }) => id),
    tileCount: tiles.length,
    tiles,
  };
}

it("§6–§7: порядок видимых непустых разделов и предложения на первой странице главной и каталога", async () => {
  const [rawDocument, firstPage] = await Promise.all([
    read("document?limit=16"),
    read("page?scope=all&count=1").then(catalogListContract.parse),
  ]);
  const document = catalogDocumentContract.parse(rawDocument);
  const ids = document.items.flatMap(({ variants }) => variants.map(({ id }) => id));
  const offers = catalogOffersContract.parse(await read(`live?ids=${ids.join(",")}`));
  expect({ home: project(document, offers), catalog: project(firstPage, firstPage.offers) }).toMatchSnapshot();
});

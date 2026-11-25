import type { PromoTerms } from "../../../src/shared/contracts/promo";

// Branch previews use their own Shop SQLite. This fixture never writes to demo.
export function seedPreviewPromos(storage: DurableObjectStorage) {
  const terms: PromoTerms = {
    name: "Скидка на первый заказ",
    kind: "automatic",
    discount: { type: "percent", value: 1000, capMinor: 15_000 },
    scope: { type: "all" },
    confirmed: true,
    purchase: { mode: "exact", number: 1 },
  };
  const samples: [string, PromoTerms][] = [
    ["first", terms],
    [
      "leto",
      { ...terms, name: "Летний промокод", kind: "code", code: "LETO10", confirmed: false, purchase: undefined },
    ],
    [
      "svet",
      {
        ...terms,
        name: "Промокод на товары без скидки",
        kind: "code",
        code: "SVET15",
        confirmed: false,
        purchase: undefined,
        discount: { type: "percent", value: 1500 },
      },
    ],
  ];
  for (const [id, sample] of samples) {
    storage.sql.exec(
      `INSERT OR IGNORE INTO promo_offers(id,revision,state,kind,code,terms,actor,updated_at)
      VALUES(?,1,'published',?,?,?,'preview-fixture',?)`,
      `preview-${id}`,
      sample.kind,
      sample.code ?? null,
      JSON.stringify(sample),
      Date.now(),
    );
  }
}

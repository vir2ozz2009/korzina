import { BadgePercent, Gift, Package, RotateCcw, ShoppingCart, Tag, UserPlus } from "lucide-react";
import type { PromoTerms } from "../../../../shared/contracts/promo";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import type { PromoCatalog } from "./api";

type Step = "goals" | "all" | "first" | "larger" | "return" | "price";
const titles = {
  goals: "Чего хотите добиться?",
  all: "Все виды акций",
  first: "Привлечь новых покупателей",
  larger: "Увеличить сумму заказа",
  return: "Пригласить за следующей покупкой",
  price: "Выберите товар",
};
export function PromoPicker({
  step,
  setStep,
  catalog,
  create,
  openProduct,
}: {
  step?: Step;
  setStep: (value?: Step) => void;
  catalog?: PromoCatalog;
  create: (kind: PromoTerms["kind"], base?: Partial<PromoTerms>) => void;
  openProduct: (id: string) => void;
}) {
  return (
    <Sheet
      open={!!step}
      title={step ? titles[step] : titles.goals}
      onOpenChange={(open) => {
        if (!open) setStep();
      }}
      onBack={step && step !== "goals" ? () => setStep("goals") : undefined}
    >
      {step === "goals" && (
        <>
          <ListItem title={titles.first} icon={<UserPlus size={20} aria-hidden />} onClick={() => setStep("first")} />
          <ListItem
            title={titles.larger}
            icon={<ShoppingCart size={20} aria-hidden />}
            onClick={() => setStep("larger")}
          />
          <ListItem
            title={titles.return}
            icon={<RotateCcw size={20} aria-hidden />}
            onClick={() => setStep("return")}
          />
          <ListItem title={titles.all} icon={<Gift size={20} />} onClick={() => setStep("all")} />
        </>
      )}
      {step && ["all", "first", "larger"].includes(step) && (
        <>
          <ListItem
            title={step === "first" ? "Скидка на первый заказ" : step === "larger" ? "Скидка от суммы" : "Скидка"}
            subtitle="Автоматически"
            icon={<BadgePercent size={20} />}
            onClick={() =>
              create(
                "automatic",
                step === "first"
                  ? {
                      purchase: { mode: "exact", number: 1 },
                      confirmed: true,
                      discount: { type: "percent", value: 1000 },
                    }
                  : step === "larger"
                    ? { minimumMinor: 1 }
                    : {},
              )
            }
          />
          {step !== "larger" && (
            <ListItem
              title={step === "first" ? "Промокод для новых покупателей" : "Промокод"}
              subtitle="Покупатель вводит код"
              icon={<Tag size={20} />}
              onClick={() =>
                create("code", step === "first" ? { purchase: { mode: "exact", number: 1 }, confirmed: true } : {})
              }
            />
          )}
          {(step === "all" || step === "larger") && (
            <>
              <ListItem
                title={step === "all" ? "Количество в подарок" : "2+1"}
                subtitle="Предложите взять несколько товаров, один из них — в подарок"
                icon={<Gift size={20} />}
                onClick={() =>
                  create("automatic", {
                    name: "2+1",
                    group: { type: "gift", buy: 2, gift: 1 },
                    scope: { type: "variants", ids: [] },
                  })
                }
              />
              <ListItem
                title="Комбо-набор"
                subtitle="Предложите товары, которые удобно купить вместе"
                icon={<Package size={20} />}
                onClick={() =>
                  create("automatic", { group: { type: "bundle", components: [], priceMinor: 0, limit: 1 } })
                }
              />
            </>
          )}
          {step === "all" && (
            <ListItem title="Цена по акции на товар" icon={<Package size={20} />} onClick={() => setStep("price")} />
          )}
        </>
      )}
      {step === "return" && (
        <>
          <ListItem
            title="Скидка на второй или третий заказ"
            subtitle="Предложите скидку после первой удачной покупки"
            icon={<BadgePercent size={20} aria-hidden />}
            onClick={() => create("automatic", { purchase: { mode: "exact", number: 2 }, confirmed: true })}
          />
          <ListItem
            title="Скидка постоянным покупателям"
            subtitle="Давайте скидку начиная с выбранной покупки"
            icon={<BadgePercent size={20} aria-hidden />}
            onClick={() => create("automatic", { purchase: { mode: "from", number: 3 }, confirmed: true })}
          />
        </>
      )}
      {step === "price" && catalog && !catalog.variants.length && (
        <ListItem title="Сначала добавьте товар" onClick={() => openProduct("new")} />
      )}
      {step === "price" &&
        [...new Map(catalog?.variants.map((variant) => [variant.productId, variant.productName])).entries()].map(
          ([id, name]) => <ListItem key={id} title={name} onClick={() => openProduct(id)} />,
        )}
    </Sheet>
  );
}

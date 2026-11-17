import { describe, expect, it } from "vitest";
import { TabHistory } from "./tab-history";

describe("кабинет: отдельный стек каждой вкладки", () => {
  it("возвращает карточку и прокрутку вкладки, повторный выбор ведёт в корень", () => {
    const history = new TabHistory();
    history.visit("/seller/orders?filter=new");
    history.visit("/seller/orders/demo");
    history.savePosition("/seller/orders/demo", 320);
    history.visit("/seller/products");
    expect(history.destination("/seller/orders", "/seller/products")).toEqual({
      href: "/seller/orders/demo",
      top: 320,
    });
    expect(history.back("/seller/orders/demo")).toBe("/seller/orders?filter=new");
    expect(history.destination("/seller/orders", "/seller/orders")).toEqual({ href: "/seller/orders", top: 0 });
    history.visit("/seller/orders");
    expect(history.back("/seller/orders")).toBe("/seller/orders");
  });
  it("возвращает прямую ссылку на карточку к корню её вкладки", () => {
    const history = new TabHistory();
    history.visit("/seller/orders/demo");
    expect(history.back("/seller/orders/demo")).toBe("/seller/orders");
  });
});

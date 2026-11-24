import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DeliveryAddress, Point } from "../../../shared/contracts/receiving";
import type { ReceivingState } from "../api";
import { AddressSheet } from "./AddressSheet";

const coordinates = { lat: 10.7769, lon: 106.7009 };
const movedPoint = { ...coordinates, lon: 106.7019 };
const street = "45 Lê Lợi, Хошимин";
const movedStreet = "60 Lê Lợi, Хошимин";
const outside = "12 rue de Rivoli, Paris";
const saved: DeliveryAddress = {
  mode: "delivery",
  address: street,
  point: coordinates,
  apartment: "12",
  entrance: "1",
};
const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock("../address-api", () => ({
  useAddressSuggestions: (text: string) => ({
    searching: false,
    query: {
      data:
        text === outside
          ? [{ address: outside, lat: 48.8566, lon: 2.3522 }]
          : text === street
            ? [{ address: street, ...coordinates }]
            : [],
    },
  }),
  usePointDelivery: (point: Point | undefined) => ({
    isPending: false,
    isFetching: false,
    isError: false,
    refetch: () => undefined,
    data:
      point &&
      (point.lat === coordinates.lat
        ? { mode: "delivery", available: true, feeMinor: 25000, tariff: "fixed", payee: "shop", inZone: true }
        : { mode: "delivery", available: false, reason: "outside", inZone: false }),
  }),
  usePointName: (point?: Point) => ({
    isPending: false,
    data: point ? [{ address: point.lon === movedPoint.lon ? movedStreet : street }] : [],
  }),
  useVerifySubmittedAddress: () => ({ isPending: false, mutateAsync: verify }),
}));

vi.mock("../../../ui/AddressMap", () => ({
  AddressMap: ({ point, select }: { point?: Point; select?: (value: Point) => void }) => (
    <section aria-label="Карта доставки">
      {point && <span>Выбранная точка</span>}
      {select && (
        <button type="button" onClick={() => select(coordinates)}>
          Установить точку
        </button>
      )}
      {select && (
        <button type="button" onClick={() => select(movedPoint)}>
          Переместить точку
        </button>
      )}
    </section>
  ),
}));

afterEach(() => {
  cleanup();
  verify.mockReset();
});

function setup(mode: "map" | "text" = "text", current?: DeliveryAddress) {
  const save = vi.fn(async (_address: DeliveryAddress) => {});
  const data: ReceivingState = {
    delivery: { mode, payee: "shop" },
    acceptingOrders: true,
    closedMessage: null,
    unavailable: {},
    banner: null,
    banners: [],
    pickup: null,
    receiving: current ?? null,
    revision: 1,
    savedAddresses: [],
    addressesRevision: 0,
    time: null,
    receivingUpdatedAt: 0,
    requiredDetails: [],
    availability: null,
  };
  render(
    <AddressSheet
      current={current}
      editCurrent={!!current}
      data={data}
      currency="VND"
      save={save}
      pending={false}
      close={() => {}}
    />,
  );
  return save;
}

const editor = () => screen.findByRole("dialog", { name: "Редактировать адрес" });
const field = (form: HTMLElement, name: string) => within(form).getByRole<HTMLInputElement>("textbox", { name });
const edit = (form: HTMLElement, name: string, value: string) =>
  fireEvent.change(field(form, name), { target: { value } });
const saveButton = (form: HTMLElement) =>
  within(form).getByRole<HTMLButtonElement>("button", { name: "Сохранить адрес" });

async function suggest(address: string) {
  const search = await screen.findByRole("searchbox");
  fireEvent.change(search, { target: { value: address } });
  fireEvent.click(await screen.findByRole("button", { name: address }));
  return editor();
}

it.each(["подсказка", "карта"])("address-edit 1 · %s заполняет обычную форму с точкой", async (source) => {
  const save = setup();
  if (source === "подсказка") await suggest(street);
  else {
    fireEvent.click(await screen.findByRole("button", { name: "Указать на карте" }));
    fireEvent.click(await screen.findByRole("button", { name: "Установить точку" }));
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить" }));
  }
  const form = await editor();
  expect(field(form, "Адрес доставки").value).toBe(street);
  await within(form).findByText("Выбранная точка");
  for (const [name, value] of [
    ["Квартира", "3"],
    ["Подъезд", "1"],
    ["Этаж", "2"],
    ["Домофон", "3"],
    ["Комментарий", "У ворот"],
  ])
    edit(form, name, value);
  fireEvent.click(saveButton(form));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      address: street,
      point: coordinates,
      apartment: "3",
      entrance: "1",
      floor: "2",
      intercom: "3",
      comment: "У ворот",
    }),
  );
});

it("address-edit 2 · произвольный адрес в режиме Куда угодно сохраняется без проверки", async () => {
  const save = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Ввести адрес вручную" }));
  const form = await screen.findByRole("dialog", { name: "Ввести адрес вручную" });
  edit(form, "Адрес доставки", "Синий дом за мостом");
  fireEvent.click(saveButton(form));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ address: "Синий дом за мостом" }));
  expect(verify).not.toHaveBeenCalled();
});

it("address-edit 3 · текущий сохранённый адрес открывается с редактируемыми полями", async () => {
  const save = setup("text", saved);
  const form = await editor();
  expect(field(form, "Квартира").value).toBe("12");
  expect(field(form, "Подъезд").value).toBe("1");
  edit(form, "Квартира", "44");
  fireEvent.click(saveButton(form));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ ...saved, apartment: "44" }));
});

it("address-edit 4 · квартира и подъезд сохраняют точку, правка улицы сбрасывает её", async () => {
  const save = setup("text", saved);
  const form = await editor();
  edit(form, "Квартира", "4");
  edit(form, "Подъезд", "5");
  fireEvent.click(saveButton(form));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ point: coordinates, apartment: "4", entrance: "5" }));
  edit(form, "Адрес доставки", "Новая улица 6");
  fireEvent.click(saveButton(form));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ address: "Новая улица 6", point: undefined }));
});

it.each(["text", "map"] as const)("address-edit 6 · новая точка заменяет адрес корзины (%s)", async (mode) => {
  const save = setup(mode, saved);
  fireEvent.click(within(await editor()).getByRole("button", { name: "Изменить точку на карте" }));
  fireEvent.click(await screen.findByRole("button", { name: "Переместить точку" }));
  fireEvent.click(await screen.findByRole("button", { name: "Продолжить" }));
  const form = await editor();
  expect(field(form, "Адрес доставки").value).toBe(movedStreet);
  fireEvent.click(saveButton(form));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ ...saved, address: movedStreet, point: movedPoint }));
});

it("address-edit 5 · зона отклоняет внешнюю точку и разрешает редактирование внутри", async () => {
  const save = setup("map");
  const form = await suggest(outside);
  await within(form).findByText("За пределами зоны доставки");
  expect(saveButton(form).disabled).toBe(true);
  fireEvent.click(within(form).getByRole("button", { name: "Указать другой адрес" }));
  const inside = await suggest(street);
  await waitFor(() => expect(saveButton(inside).disabled).toBe(false));
  edit(inside, "Квартира", "12А");
  fireEvent.click(saveButton(inside));
  expect(save).toHaveBeenCalledOnce();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ point: coordinates, apartment: "12А" }));
});

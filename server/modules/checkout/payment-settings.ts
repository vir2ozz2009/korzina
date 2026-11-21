import type { PaymentSettings } from "../../../src/shared/contracts/checkout";
import type { PaymentOption } from "../../../src/shared/contracts/seller-payments";

export function paymentOptions(settings: PaymentSettings): PaymentOption[] {
  if (settings.options) return settings.options;
  const options: Record<"cash" | "transfer", PaymentOption> = {
    cash: {
      id: "cash",
      template: "cash",
      name: "Наличные при получении",
      enabled: settings.methods.includes("cash"),
      requiresReceipt: false,
    },
    transfer: {
      id: "transfer",
      template: "card",
      name: "Перевод",
      enabled: settings.methods.includes("transfer") && !!(settings.instruction || settings.qrSrc),
      instruction: settings.instruction,
      imageSrc: settings.qrSrc,
      requiresReceipt: true,
    },
  };
  return [...new Set([...settings.methods, "cash", "transfer"] as const)].map((method) => options[method]);
}

export function checkoutPayments(settings: PaymentSettings): PaymentSettings {
  const enabled = paymentOptions(settings).filter((option) => option.enabled);
  if (!settings.options)
    return { ...settings, methods: enabled.map((option) => (option.id === "cash" ? "cash" : "transfer")) };
  const firstTransfer = enabled.find((option) => option.template !== "cash");
  return {
    minimumMinor: settings.minimumMinor,
    methods: [
      ...new Set(enabled.map((option) => (option.template === "cash" ? ("cash" as const) : ("transfer" as const)))),
    ],
    instruction: firstTransfer?.instruction,
    qrSrc: firstTransfer?.imageSrc,
    options: enabled,
  };
}

export function selectedPayment(settings: PaymentSettings, kind: "cash" | "transfer", id?: string) {
  return paymentOptions(settings).find(
    (option) => option.enabled && (option.template === "cash") === (kind === "cash") && (!id || option.id === id),
  );
}

const dishes: ReadonlyMap<string, readonly string[]> = new Map([
  ["греческий салат", ["томаты", "огурцы", "сладкий перец", "красный лук", "оливки", "фета"]],
]);

export function readShoppingSearch(value: string) {
  if ([...value].length > 4000)
    return {
      kind: "error",
      title: "Слишком длинный запрос",
      message: "Введите до 4000 символов. Ваш текст сохранён.",
    } as const;
  const name = value.trim();
  const parts = name
    .split(/(?<!\d),|,(?!\d)|[\r\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 40)
    return {
      kind: "error",
      title: "Слишком много позиций",
      message: "В одном списке может быть до 40 позиций. Ваш список сохранён.",
    } as const;
  const ingredients = dishes.get(name.toLocaleLowerCase("ru").replace(/\s+/gu, " "));
  if (ingredients) return { kind: "dish", name, parts: ingredients } as const;
  if (parts.length > 1) return { kind: "list", parts } as const;
  return { kind: "single", q: parts[0] ?? "" } as const;
}

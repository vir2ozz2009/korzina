const plural = new Intl.PluralRules("ru");

export function ruPlural(count: number, one: string, few: string, many: string): string {
  const form = plural.select(count);
  return form === "one" ? one : form === "few" ? few : many;
}

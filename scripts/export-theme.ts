import { readFileSync, writeFileSync } from "node:fs";

// F6: a reviewable native theme definition for MagicPath; values come only from tokens.css.
const css = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
function variables(selector: string) {
  const body = css.split(selector)[1]?.split("}")[0] ?? "";
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}
const light = variables(":root {");
const common = Object.fromEntries(
  Object.entries(variables("@theme inline {")).filter(
    ([key, value]) => !key.startsWith("--color-") && !value.startsWith("var("),
  ),
);
writeFileSync(
  new URL("../docs/design-system/korzina-theme.json", import.meta.url),
  `${JSON.stringify({ name: "Korzina", type: "tailwind", data: { version: 1, theme: { ...common, light } } }, null, 2)}\n`,
);

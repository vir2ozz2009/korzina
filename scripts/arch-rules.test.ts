import { describe, expect, it } from "vitest";
import { inspectSource } from "./arch-rules";

const feature = "src/features/cart/ui/Cart.tsx";

describe("архитектурные ограничения", () => {
  it.each([
    [feature, 'const color = "#fff";'],
    ["src/styles/storefront.css", ".tile { display: flex; }"],
    ["src/shared/api.ts", "import { app } from '../../server/index'"],
    ["src/shared/api.ts", "import type { Other } from '../../server/index'"],
    [feature, 'const color = "rgb(1 2 3)";'],
    ["src/ui/Button.tsx", '<button className="bg-primary text-white" />'],
    [feature, '<div className="w-[123px]" />'],
    [feature, "<div style={{ color: accent }} />"],
    [feature, "<div style={{ backgroundColor: accent }} />"],
    [feature, "import { X } from '../../catalog/ui/X'"],
    [feature, "export { X } from '@/features/catalog/model'"],
    [feature, "const x = import('@/features/catalog/ui/X')"],
    ["src/app/App.tsx", "import { app } from '../../server/index'"],
    ["server/index.ts", "import { x } from '../src/features/cart/model'"],
    ["src/routes/index.tsx", "fetch('/api/catalog')"],
    ["src/routes/index.tsx", "api.catalog.$get()"],
    [feature, "const minor = value * 100;"],
    [feature, "const major = value / 100;"],
    [feature, "const minor = 100 * value;"],
    [feature, "const formatted = value.toFixed(2);"],
    ["scripts/long.ts", "const x = 1;\n".repeat(251)],
  ])("отклоняет нарушение в %s: %s", (path, content) => {
    expect(inspectSource({ path, content }).errors).not.toHaveLength(0);
  });

  it.each(["src/long.ts", "server/long.ts"])("отклоняет новый файл длиннее 250 строк: %s", (path) => {
    const content = "const x = 1;\n".repeat(251);
    expect(inspectSource({ path, content }).errors).toEqual([`${path}: длина 251 строк, максимум 250`]);
  });

  it("разрешает исходную длину исключения и запрещает её увеличить", () => {
    const path = "server/platform/schema.ts";
    const content = "const x = 1;\n".repeat(251);
    expect(inspectSource({ path, content }).errors).toEqual([]);
    expect(inspectSource({ path, content: `${content}const y = 2;` }).errors).toEqual([
      `${path}: длина 252 строк, максимум 251`,
    ]);
  });

  it.each([
    [feature, '<div className="bg-primary text-primary-foreground w-full" />'],
    ["src/shared/api.ts", "import type { AppType } from '../../server/index'"],
    [feature, "import { X } from '@/features/catalog/index'"],
    [feature, "import { X } from '@/features/catalog'"],
    [feature, "import { X } from '../../catalog/index.ts'"],
    [feature, "import { x } from '../model'"],
    [feature, "import { x } from '@/shared/money'"],
    ["src/shared/money.ts", "const minor = value * 100;"],
    ["src/shared/theme-presets.ts", 'const color = "#ffffff";'],
    ["src/styles/main.css", "@import 'tailwindcss';"],
    ["src/styles/tokens.css", ":root { --primary: #ff335f; }"],
    ["server/index.ts", "const x = 1;\n".repeat(250)],
  ])("разрешает корректный код в %s", (path, content) => {
    expect(inspectSource({ path, content })).toEqual({ errors: [], warnings: [] });
  });
});

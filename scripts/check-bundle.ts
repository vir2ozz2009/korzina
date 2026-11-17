import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

type Chunk = { file: string; entry: boolean; imports: string[]; modules: string[] };
const assets = ".cloudflare/output/v1/workers/default/assets";
const chunks: Chunk[] = JSON.parse(readFileSync(`${assets}/bundle-report.json`, "utf8"));
if (!chunks.length || !chunks.some((chunk) => chunk.entry)) throw new Error("Нет клиентского отчёта Vite");
const production = process.argv.includes("--prod");
const initial = new Set<string>();
function include(file: string) {
  if (initial.has(file)) return;
  const chunk = chunks.find((item) => item.file === file);
  if (!chunk) throw new Error(`Не найден чанк ${file}`);
  initial.add(file);
  for (const dependency of chunk.imports) include(dependency);
}
for (const chunk of chunks) {
  // The demo home is the storefront until B2 replaces it with the real catalog.
  if (
    chunk.entry ||
    chunk.modules.some((path) => /src\/(routes\/dev-routes\.tsx|features\/demo\/ui\/ShopScreens\.tsx)$/.test(path))
  ) {
    include(chunk.file);
  }
}
let firstScreen = 0;
const errors: string[] = [];
for (const chunk of chunks) {
  const bytes = gzipSync(readFileSync(`${assets}/${chunk.file}`)).byteLength;
  const size = (bytes / 1024).toFixed(2);
  if (initial.has(chunk.file)) firstScreen += bytes;
  if (!chunk.entry && bytes > 60 * 1024) errors.push(`${chunk.file}: ${size} КБ gzip > 60 КБ`);
  if (
    production &&
    chunk.modules.some((path) =>
      /src\/(?:app\/dev\/|features\/demo\/|routes\/(?:dev|demo|shop|seller)-routes\.tsx|features\/media\/ui\/MediaScreen\.tsx)/.test(
        path,
      ),
    )
  ) {
    errors.push(`Демо-код попал в prod: ${chunk.file}`);
  }
}
console.log(
  `Первый экран (${production ? "prod" : "demo"}): ${(firstScreen / 1024).toFixed(2)} / 150 КБ gzip; чанков: ${chunks.length}`,
);
if (firstScreen > 150 * 1024) errors.push("JS первого экрана превышает 150 КБ gzip");
if (errors.length) throw new Error(errors.join("\n"));

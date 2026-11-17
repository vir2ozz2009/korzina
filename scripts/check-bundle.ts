import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

type Chunk = {
  file: string;
  entry: boolean;
  imports: string[];
  modules: string[];
  moduleSizes: { path: string; bytes: number }[];
};
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
  // Include the route table and the real storefront in both deployment modes.
  if (
    chunk.entry ||
    chunk.modules.some((path) =>
      /src\/(routes\/(?:dev|shop|upcoming)-routes\.tsx|features\/catalog\/ui\/HomeScreen\.tsx)$/.test(path),
    )
  ) {
    include(chunk.file);
  }
}
let firstScreen = 0;
const errors: string[] = [];
const deferred =
  /src\/(?:ui\/(?:PhotoPicker(?:Content|Tile)?|ImageViewerContent|SheetContent|DialogContent)\.tsx|features\/media\/|app\/templates\/FormTemplateContent\.tsx)|node_modules\/(?:vaul|react-zoom-pan-pinch|zod)\//;
for (const chunk of chunks) {
  const bytes = gzipSync(readFileSync(`${assets}/${chunk.file}`)).byteLength;
  const size = (bytes / 1024).toFixed(2);
  if (initial.has(chunk.file)) firstScreen += bytes;
  if (initial.has(chunk.file) && chunk.modules.some((path) => deferred.test(path))) {
    errors.push(`Тяжёлый модуль должен загружаться лениво: ${chunk.file}`);
  }
  if (!chunk.entry && bytes > 60 * 1024) errors.push(`${chunk.file}: ${size} КБ gzip > 60 КБ`);
  if (
    production &&
    chunk.modules.some((path) =>
      /src\/(?:app\/dev\/|features\/demo\/|routes\/(?:dev|demo|seller)-routes\.tsx|features\/media\/ui\/MediaScreen\.tsx)/.test(
        path,
      ),
    )
  ) {
    errors.push(`Демо-код попал в prod: ${chunk.file}`);
  }
}
console.log(
  `Первый экран (${production ? "prod" : "demo"}): ${(firstScreen / 1024).toFixed(2)} / 120 КБ gzip; чанков: ${chunks.length}`,
);
if (process.argv.includes("--details")) {
  for (const chunk of chunks.filter((chunk) => chunk.entry)) {
    console.log(`Топ entry ${chunk.file}, байт до минификации:`);
    console.table(chunk.moduleSizes.sort((a, b) => b.bytes - a.bytes).slice(0, 8));
  }
}
if (firstScreen > 120 * 1024) errors.push("JS первого экрана превышает 120 КБ gzip");
if (errors.length) throw new Error(errors.join("\n"));

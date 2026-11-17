import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
export function bundleReport(): Plugin {
  return {
    name: "korzina-bundle-report",
    apply: "build",
    applyToEnvironment: (env) => env.name === "client",
    writeBundle(options, bundle) {
      if (!options.dir) throw new Error("Нет каталога клиентской сборки");
      // Vite can remove an empty entry facade while rewriting HTML in generateBundle.
      // Inspect final emitted files and the real HTML module roots, after that rewrite.
      const html = readFileSync(join(options.dir, "index.html"), "utf8");
      const entries = new Set([...html.matchAll(/<script\b[^>]*\bsrc="\/?([^"]+)"/g)].map((match) => match[1]));
      const chunks = Object.values(bundle)
        .filter((item) => item.type === "chunk")
        .filter((chunk) => {
          if (existsSync(join(options.dir as string, chunk.fileName))) return true;
          if (Object.keys(chunk.modules).length) throw new Error(`Отсутствует чанк ${chunk.fileName}`);
          return false;
        });
      const report = chunks.map((chunk) => ({
        file: chunk.fileName,
        entry: entries.has(chunk.fileName),
        imports: chunk.imports,
        modules: Object.keys(chunk.modules).map((path) => path.replace(`${process.cwd()}/`, "")),
        moduleSizes: Object.entries(chunk.modules).map(([path, module]) => ({
          path: path.replace(`${process.cwd()}/`, ""),
          bytes: module.renderedLength,
        })),
      }));
      writeFileSync(join(options.dir, "bundle-report.json"), JSON.stringify(report));
    },
  };
}

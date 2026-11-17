import type { Plugin } from "vite";

export function bundleReport(): Plugin {
  return {
    name: "korzina-bundle-report",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    generateBundle(_, bundle) {
      this.emitFile({
        type: "asset",
        fileName: "bundle-report.json",
        source: JSON.stringify(
          Object.values(bundle)
            .filter((item) => item.type === "chunk")
            .map((chunk) => ({
              file: chunk.fileName,
              entry: chunk.isEntry,
              imports: chunk.imports,
              modules: Object.keys(chunk.modules).map((path) => path.replace(`${process.cwd()}/`, "")),
            })),
        ),
      });
    },
  };
}

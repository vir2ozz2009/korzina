import { posix } from "node:path";

export interface SourceFile {
  path: string;
  content: string;
}

// Exceptions require a task ID and a reason; no exceptions are needed in F1.
const lineExceptions: Readonly<Record<string, { task: string; reason: string }>> = {};
const sourceExtension = /\.(?:[cm]?[jt]sx?|css)$/;
const restrictedUi = /^src\/(?:features|routes|ui)\//;
const literalColor = /#[\da-f]{3,8}\b|\brgba?\s*\(/i;
const arbitraryPixels = /\[[^\]\n]*\d(?:\.\d+)?px[^\]\n]*\]/;
const imports = /\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)['"]([^'"]+)['"]/g;

function resolveImport(file: string, specifier: string): string {
  if (specifier.startsWith(".")) return posix.normalize(posix.join(posix.dirname(file), specifier));
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  return specifier.replace(/^\//, "");
}

export function inspectSource({ path, content }: SourceFile): string[] {
  if (!sourceExtension.test(path)) return [];
  const errors: string[] = [];
  if (
    path.startsWith("src/") &&
    path.endsWith(".css") &&
    !["src/styles/tokens.css", "src/styles/main.css"].includes(path)
  )
    errors.push(`${path}: стили должны быть Tailwind-классами на токенах`);
  const report = (message: string) => errors.push(`${path}: ${message}`);
  const lines = content.trimEnd().split("\n").length;
  if (lines > 250 && !lineExceptions[path]) report(`длина ${lines} строк, максимум 250`);

  if (restrictedUi.test(path)) {
    if (literalColor.test(content)) report("цвета задаются токенами");
    if (arbitraryPixels.test(content)) report("произвольные px-классы запрещены");
    if (/\bbg-primary\b/.test(content) && /\btext-white\b/.test(content)) {
      report("для bg-primary используйте text-primary-foreground");
    }
    if (/\bstyle\s*=\s*\{[\s\S]*?\b(?:\w*[Cc]olor|color|background|fill|stroke)['"]?\s*[:\]]/.test(content)) {
      report("inline style с цветом запрещён");
    }
  }

  if (path.startsWith("src/routes/") && /\b(?:fetch\s*\(|api\s*(?:\?\.)?\.)/.test(content)) {
    report("маршрут обращается к API напрямую");
  }
  if (path.startsWith("src/features/") && /(?:\*\s*100\b|\/\s*100\b|\b100\s*\*|\.\s*toFixed\s*\()/.test(content)) {
    report("арифметика денег разрешена только в src/shared/money.ts");
  }

  const ownFeature = /^src\/features\/([^/]+)\//.exec(path)?.[1];
  for (const match of content.matchAll(imports)) {
    const target = resolveImport(path, match[1]);
    // F3: Hono RPC needs exactly one erased AppType import; runtime server imports stay forbidden.
    const rpcType =
      path === "src/shared/api.ts" &&
      target === "server/index" &&
      /import\s+type\s*\{\s*AppType\s*\}\s*from\s*$/.test(
        content.slice(0, match.index + match[0].indexOf(match[1]) - 1),
      );
    if (path.startsWith("src/") && target.startsWith("server/") && !rpcType) {
      report(`клиент импортирует сервер: ${match[1]}`);
    }
    if (path.startsWith("server/") && target.startsWith("src/features/")) {
      report(`сервер импортирует клиентскую фичу: ${match[1]}`);
    }
    const otherFeature = /^src\/features\/([^/]+)(.*)$/.exec(target);
    if (
      ownFeature &&
      otherFeature &&
      otherFeature[1] !== ownFeature &&
      otherFeature[2] !== "" &&
      !/^\/index(?:\.[cm]?[jt]sx?)?$/.test(otherFeature[2])
    ) {
      report(`внутренности другой фичи: ${match[1]}`);
    }
  }
  return errors;
}

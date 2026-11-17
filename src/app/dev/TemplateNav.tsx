import { Link } from "@tanstack/react-router";
import { type TemplateName, templateNames } from "../templates/types";

export function TemplateNav({ template }: { template: TemplateName }) {
  return (
    <>
      <nav aria-label="Шаблоны" className="flex flex-wrap gap-2 bg-card p-3">
        {templateNames.map((name) => (
          <Link
            key={name}
            to={`/dev/templates/${name}`}
            className="rounded-pill bg-secondary px-3 py-2 text-small"
            aria-current={name === template ? "page" : undefined}
          >
            {name}
          </Link>
        ))}
      </nav>
      <nav aria-label="Состояния" className="flex flex-wrap gap-3 p-3 text-caption">
        {([undefined, "loading", "fast", "empty", "error"] as const).map((simulate) => (
          <Link
            key={simulate ?? "ready"}
            to={`/dev/templates/${template}`}
            search={{ simulate }}
            className="text-primary-text"
          >
            {simulate ?? "ready"}
          </Link>
        ))}
      </nav>
    </>
  );
}

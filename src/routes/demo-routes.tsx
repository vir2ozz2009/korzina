import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { TemplateNav } from "../app/dev/TemplateNav";
import { TemplatePending } from "../app/templates/TemplatePending";
import { templateNames } from "../app/templates/types";
import { demoQuery, demoSearch } from "../features/demo/api";
import { rootRoute } from "./root";

const gallery = lazyRouteComponent(() => import("../features/demo/ui/TemplateGallery"), "TemplateGallery");
export const demoRoutes = templateNames.map((template) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: `/dev/templates/${template}`,
    staticData: { template, transition: "push", title: `Шаблон · ${template}` },
    validateSearch: demoSearch,
    loaderDeps: ({ search }) => ({ simulate: search.simulate }),
    loader: ({ context, deps }) =>
      context.qc.ensureQueryData(demoQuery(template, deps.simulate)).catch(() => undefined),
    component: gallery,
    pendingComponent: () => (
      <>
        <TemplateNav template={template} />
        <TemplatePending template={template} />
      </>
    ),
  }),
);

import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { TemplatePending } from "../app/templates/TemplatePending";
import { templateNames } from "../app/templates/types";
import { demoQuery, demoSearch } from "../features/demo/api";
import { rootRoute } from "./root";

const gallery = lazyRouteComponent(() => import("../features/demo/ui/TemplateGallery"), "TemplateGallery");
const TemplateNav = lazy(() => import("../app/dev/TemplateNav").then((module) => ({ default: module.TemplateNav })));
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
        <Suspense fallback={null}>
          <TemplateNav template={template} />
        </Suspense>
        <TemplatePending template={template} />
      </>
    ),
  }),
);

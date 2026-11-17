import { type ComponentProps, lazy, Suspense } from "react";
import { TemplatePending } from "./TemplatePending";

const Content = lazy(() => import("./FormTemplateContent").then((module) => ({ default: module.FormTemplateContent })));
export function FormTemplate(props: ComponentProps<typeof Content>) {
  return (
    <Suspense fallback={<TemplatePending template="form" />}>
      <Content {...props} />
    </Suspense>
  );
}

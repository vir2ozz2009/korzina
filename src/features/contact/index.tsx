import { type ComponentProps, lazy, Suspense } from "react";

const Sheet = lazy(() => import("./ContactSheet").then((module) => ({ default: module.ContactSheet })));

export function ContactSheet(props: ComponentProps<typeof Sheet>) {
  if (!props.mode) return null;
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  );
}

export { useContact } from "./api";

import { SkeletonBlock } from "../../ui/SkeletonBlock";
import { SkeletonText } from "../../ui/SkeletonText";
import { Screen } from "../shell/Screen";
import { TemplateSkeleton } from "./TemplateSkeleton";
import type { TemplateName } from "./types";

export function TemplatePending({ template = "home" }: { template?: TemplateName }) {
  return (
    <Screen
      header={
        <div className="flex min-h-18 items-center bg-card px-5">
          <SkeletonText size="title" short />
        </div>
      }
      footer={
        ["product", "checkout", "form"].includes(template) ? (
          <SkeletonBlock className="h-(--control-lg) rounded-pill" />
        ) : undefined
      }
    >
      <div aria-busy="true">
        <TemplateSkeleton template={template} />
      </div>
    </Screen>
  );
}

import { useRouterState } from "@tanstack/react-router";
import { TemplateNav } from "../../../app/dev/TemplateNav";
import { TemplateView } from "./TemplateView";

export function TemplateGallery() {
  const template = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.template ?? "home" });
  return (
    <>
      <TemplateNav template={template} />
      <TemplateView template={template} />
    </>
  );
}

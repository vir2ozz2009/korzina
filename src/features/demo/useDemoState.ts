import { useNavigate } from "@tanstack/react-router";
import type { TemplateName, TemplateState } from "../../app/templates/types";
import { useDemo } from "./api";

export function useDemoState(template: TemplateName): TemplateState {
  const query = useDemo(template);
  const navigate = useNavigate();
  return { query, empty: query.data?.length === 0, onEmpty: () => void navigate({ to: "/" }) };
}

import type { ReactNode } from "react";
import type { QueryResult } from "../shell/QueryBoundary";

export const templateNames = ["home", "catalog", "product", "checkout", "order", "form", "list", "feedback"] as const;
export type TemplateName = (typeof templateNames)[number];
export interface TemplateState {
  query: QueryResult<unknown>;
  empty?: boolean;
  onEmpty?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}
export interface TemplateProps {
  state?: TemplateState;
  title: string;
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

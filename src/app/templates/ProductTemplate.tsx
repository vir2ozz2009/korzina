import type { ReactNode } from "react";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import type { TemplateProps } from "./types";

export function ProductTemplate({
  state,
  title,
  header,
  gallery,
  info,
  related,
  buyBar,
}: Omit<TemplateProps, "children"> & {
  gallery: ReactNode;
  info: ReactNode;
  related?: ReactNode;
  buyBar: ReactNode;
}) {
  return (
    <Screen state={state} template="product" header={header ?? <Header title={title} />} footer={buyBar}>
      <div className="relative">{gallery}</div>
      {info}
      {related}
    </Screen>
  );
}

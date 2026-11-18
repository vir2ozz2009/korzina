import { useParams } from "@tanstack/react-router";
import { ProductList } from "./ProductList";

export function BrandScreen() {
  const { id } = useParams({ strict: false }) as { id: string };
  return <ProductList scope={`brand:${id}`} />;
}

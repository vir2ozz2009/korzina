import { useParams } from "@tanstack/react-router";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { FeedbackTemplate } from "../../../app/templates/FeedbackTemplate";
import { useProduct } from "../product-api";

export function DetailsScreen() {
  const { id } = useParams({ strict: false }) as { id: string };
  const query = useProduct(id);
  return (
    <FeedbackTemplate
      sheet
      title="Подробнее о товаре"
      actions={null}
      body={
        <QueryBoundary query={query} template="feedback">
          {(product) => (
            <div className="space-y-3">
              <h2 className="text-title-3">{product.name}</h2>
              {product.description && (
                <p className="whitespace-pre-line text-body text-foreground-body">{product.description}</p>
              )}
              {product.ingredients && (
                <section>
                  <h3 className="text-label">Состав</h3>
                  <p className="whitespace-pre-line text-body">{product.ingredients}</p>
                </section>
              )}
              {product.storageNotes && (
                <section>
                  <h3 className="text-label">Хранение</h3>
                  <p className="whitespace-pre-line text-body">{product.storageNotes}</p>
                </section>
              )}
              {!product.description && !product.ingredients && !product.storageNotes && (
                <p>Магазин пока не добавил описание.</p>
              )}
            </div>
          )}
        </QueryBoundary>
      }
    />
  );
}

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "../../../ui/Button";
import { ProductImage } from "../../../ui/ProductImage";
import { Sheet } from "../../../ui/Sheet";
import { chatPhoto } from "../api";

export function ChatPhoto({ number, mediaId, store }: { number: number; mediaId: string; store?: string }) {
  const [source, setSource] = useState<string>();
  const [open, setOpen] = useState(false);
  const image = useQuery({
    queryKey: ["chat-photo", store, number, mediaId],
    queryFn: ({ signal }) => chatPhoto(number, mediaId, store, signal),
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (!image.data) return;
    const url = URL.createObjectURL(image.data);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [image.data]);
  if (image.isError)
    return (
      <>
        <p>Фото недоступно</p>
        <Button variant="ghost" onClick={() => void image.refetch()}>
          Повторить
        </Button>
      </>
    );
  if (!source) return <p role="status">Загружаем фото…</p>;
  return (
    <>
      <button type="button" className="block w-28" aria-label="Открыть фото" onClick={() => setOpen(true)}>
        <ProductImage src={source} alt="Фото в переписке" />
      </button>
      {open && (
        <Sheet open title="Фото" onOpenChange={setOpen}>
          <img src={source} className="max-h-96 w-full object-contain" alt="Фото в переписке" />
        </Sheet>
      )}
    </>
  );
}

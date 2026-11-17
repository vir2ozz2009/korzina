import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import { FormTemplate } from "../../../app/templates/FormTemplate";
import type { MediaPurpose } from "../../../shared/contracts/media";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Input } from "../../../ui/Input";
import { ProductImage } from "../../../ui/ProductImage";
import { Select } from "../../../ui/Select";
import { SkeletonText } from "../../../ui/SkeletonText";
import { attachMedia, mediaLink, usageQuery, useUpload } from "../api";

export function MediaScreen() {
  const notify = useToast();
  const seller = new URLSearchParams(location.search).get("as") === "seller";
  const [purpose, setPurpose] = useState<MediaPurpose>(seller ? "product" : "receipt");
  const [file, setFile] = useState<File>();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const upload = useUpload(seller);
  const usage = useQuery({ ...usageQuery(), enabled: seller });
  const result = upload.data;
  return (
    <FormTemplate
      title="Фото и файлы"
      submit={upload.isError ? "Повторить загрузку" : "Загрузить"}
      submitting={upload.isPending}
      error={upload.error?.message ?? message}
      onSubmit={() => {
        setMessage("");
        if (!file) {
          setMessage("Выберите файл");
          return;
        }
        upload.mutate({ file, purpose, key });
      }}
      groups={[
        <Card key="upload">
          <Select
            label="Назначение"
            value={purpose}
            onChange={(value) => {
              setPurpose(value as MediaPurpose);
              setKey(crypto.randomUUID());
              upload.reset();
            }}
            options={
              seller
                ? [
                    { value: "product", label: "Товар или категория" },
                    { value: "logo", label: "Логотип" },
                    { value: "cover", label: "Обложка" },
                    { value: "payment_qr", label: "QR оплаты" },
                  ]
                : [
                    { value: "receipt", label: "Чек" },
                    { value: "chat", label: "Вложение в чат" },
                    { value: "review", label: "Фото отзыва" },
                    { value: "refund", label: "Возврат" },
                  ]
            }
          />
          <Input
            type="file"
            label="Фото или файл"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
            hint="Фото сжимаются перед отправкой. До 10 МБ после сжатия."
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              setKey(crypto.randomUUID());
              upload.reset();
              setMessage("");
            }}
          />
        </Card>,
        seller && (
          <Card key="usage">
            {usage.data ? (
              <p>
                Занято {(usage.data.used / 1024 ** 2).toLocaleString("ru", { maximumFractionDigits: 1 })} МБ /{" "}
                {(usage.data.limit / 1024 ** 3).toLocaleString("ru")} ГБ
              </p>
            ) : usage.isError ? (
              <Button variant="secondary" onClick={() => void usage.refetch()}>
                Повторить проверку хранилища
              </Button>
            ) : (
              <SkeletonText />
            )}
          </Card>
        ),
        result && (
          <Card key="result">
            <p role="status">
              Файл загружен · {(result.bytes / 1024).toLocaleString("ru", { maximumFractionDigits: 0 })} КБ
            </p>
            {result.image && (
              <ProductImage
                {...result.image}
                alt="Загруженное фото"
                sizes="(max-width: 390px) 90vw, 350px"
                className="w-full"
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  void attachMedia(result.id, seller)
                    .then(() => notify("Файл сохранён"))
                    .catch((error: Error) => setMessage(error.message))
                }
              >
                Сохранить файл
              </Button>
              {!result.image && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    void mediaLink(result.id, seller)
                      .then(({ url }) => window.open(url, "_blank", "noopener"))
                      .catch((error: Error) => setMessage(error.message))
                  }
                >
                  Открыть файл
                </Button>
              )}
            </div>
          </Card>
        ),
      ]}
    />
  );
}

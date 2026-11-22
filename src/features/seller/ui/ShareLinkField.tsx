import { Input } from "../../../ui/Input";

export function ShareLinkField({ url }: { url: string }) {
  return (
    <Input
      label="Ссылка для ручного копирования"
      value={url}
      readOnly
      onFocus={(event) => event.currentTarget.select()}
    />
  );
}

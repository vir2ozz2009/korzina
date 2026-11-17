import { Copy } from "lucide-react";
import { IconButton } from "./IconButton";
export function CopyField({
  label,
  value,
  onCopied,
  onError,
}: {
  label: string;
  value: string;
  onCopied: () => void;
  onError: () => void;
}) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      onCopied();
    } catch {
      onError();
    }
  }
  return (
    <div className="flex items-center gap-3 rounded-sm bg-secondary px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-micro text-muted-foreground">{label}</span>
        <span className="block break-all text-caption">{value}</span>
      </span>
      <IconButton aria-label={`Копировать ${label}`} onClick={copy}>
        <Copy size={20} />
      </IconButton>
    </div>
  );
}

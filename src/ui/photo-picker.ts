export interface PhotoPickerItem {
  id: string;
  name: string;
  kind: "image" | "pdf";
  src?: string;
  status: "uploading" | "ready" | "error";
  progress?: number;
  error?: string;
  retryable?: boolean;
}

export function movePhoto<T extends { id: string }>(items: readonly T[], id: string, target: string): T[] {
  const from = items.findIndex((item) => item.id === id);
  const to = items.findIndex((item) => item.id === target);
  if (from < 0 || to < 0 || from === to) return [...items];
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

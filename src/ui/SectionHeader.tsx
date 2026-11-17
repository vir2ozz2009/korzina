export function SectionHeader({ title, href, action = "Все ›" }: { title: string; href?: string; action?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-title-2">{title}</h2>
      {href && (
        <a href={href} className="flex min-h-11 items-center text-caption text-muted-foreground">
          {action}
        </a>
      )}
    </div>
  );
}

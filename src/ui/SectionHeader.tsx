export function SectionHeader({
  title,
  href,
  onClick,
  action = "Все ›",
}: {
  title: string;
  href?: string;
  onClick?: () => void;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-title-2">{title}</h2>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-h-11 items-center text-caption text-muted-foreground"
        >
          {action}
        </button>
      ) : (
        href && (
          <a href={href} className="flex min-h-11 items-center text-caption text-muted-foreground">
            {action}
          </a>
        )
      )}
    </div>
  );
}

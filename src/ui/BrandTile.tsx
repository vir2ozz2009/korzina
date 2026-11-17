export function BrandTile({ name, logo, href }: { name: string; logo?: string; href?: string }) {
  const Tile = href ? "a" : "div";
  return (
    <Tile
      href={href}
      className="flex h-28 w-32 shrink-0 flex-col items-center justify-center gap-2 rounded-lg bg-card p-3"
    >
      {logo ? (
        <img src={logo} alt="" loading="lazy" className="h-11 w-full object-contain" />
      ) : (
        <span className="flex h-11 items-center text-title-2 text-muted-foreground">{name.slice(0, 1)}</span>
      )}
      <span className="text-center text-small font-medium">{name}</span>
    </Tile>
  );
}

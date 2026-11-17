export function AboutStore({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="w-full space-y-1 rounded-xl bg-card p-3 text-left" onClick={onClick}>
      <span className="block text-label">О магазине ›</span>
      <span className="block text-small text-muted-foreground">Контакты, часы работы и условия получения</span>
    </button>
  );
}

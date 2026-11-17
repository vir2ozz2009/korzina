export function Skeleton({ className = "h-5 w-full" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse [animation-duration:var(--duration-skeleton)] rounded-md bg-input motion-reduce:animate-none ${className}`}
    />
  );
}

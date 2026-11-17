import { type TextareaHTMLAttributes, useCallback, useId, useLayoutEffect, useRef, useState } from "react";
export function TextArea({
  label,
  error,
  maxLength,
  value,
  defaultValue,
  onChange,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [length, setLength] = useState(String(defaultValue ?? "").length);
  const resize = useCallback(() => {
    const element = ref.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }
  }, []);
  useLayoutEffect(() => {
    if (value !== undefined) resize();
  }, [value, resize]);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-label">
        {label}
      </label>
      <textarea
        {...props}
        id={id}
        ref={ref}
        rows={2}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        onChange={(event) => {
          resize();
          setLength(event.target.value.length);
          onChange?.(event);
        }}
        aria-invalid={!!error}
        aria-describedby={maxLength || error ? `${id}-hint` : undefined}
        className="max-h-32 min-h-20 w-full resize-none rounded-lg bg-input p-4 text-body focus:text-body-lg disabled:opacity-40 placeholder:text-placeholder"
      />
      <p
        id={`${id}-hint`}
        className={`text-small ${error ? "text-status-danger-foreground" : "text-muted-foreground"}`}
      >
        {error ?? (maxLength ? `${value !== undefined ? String(value).length : length} / ${maxLength}` : "")}
      </p>
    </div>
  );
}

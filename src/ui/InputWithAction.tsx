import { Button } from "./Button";
import { Input, type InputProps } from "./Input";
export function InputWithAction({
  action,
  onAction,
  loading,
  ...props
}: InputProps & { action: string; onAction: () => void; loading?: boolean }) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Input {...props} />
      </div>
      <Button variant="soft" onClick={onAction} loading={loading} disabled={props.disabled}>
        {action}
      </Button>
    </div>
  );
}

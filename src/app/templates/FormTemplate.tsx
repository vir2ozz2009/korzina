import { useBlocker } from "@tanstack/react-router";
import { Children, type ReactNode } from "react";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import type { TemplateProps } from "./types";

export function FormTemplate({
  state,
  title,
  header,
  groups,
  submit = "Сохранить",
  onSubmit,
  dirty = false,
  submitting,
  error,
}: Omit<TemplateProps, "children"> & {
  groups: readonly ReactNode[];
  submit?: string;
  onSubmit: () => void;
  dirty?: boolean;
  submitting?: boolean;
  error?: string;
}) {
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: dirty, withResolver: true });
  return (
    <>
      <Screen
        state={state}
        template="form"
        header={header ?? <Header title={title} />}
        footer={
          <Button type="submit" form="screen-form" full size="lg" loading={submitting}>
            {submit}
          </Button>
        }
      >
        <form
          id="screen-form"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {Children.map([...groups], (child) => (
            <div>{child}</div>
          ))}
          {error && (
            <p role="alert" className="text-status-danger-foreground">
              {error}
            </p>
          )}
        </form>
      </Screen>
      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Выйти без сохранения?"
        description="Введённые изменения будут потеряны."
        confirm="Выйти"
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}

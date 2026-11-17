import { useCallback, useState } from "react";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Toast } from "../../../ui/Toast";

export function DemoUndo() {
  const [deleted, setDeleted] = useState(false);
  const [visible, setVisible] = useState(false);
  const close = useCallback(() => setVisible(false), []);
  return (
    <>
      <Card>
        <h2 className="text-title-3">Заметка к заказу</h2>
        {deleted ? (
          <p className="text-muted-foreground">Заметка удалена</p>
        ) : (
          <>
            <p>Оставить у двери</p>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleted(true);
                setVisible(true);
              }}
            >
              Удалить заметку
            </Button>
          </>
        )}
      </Card>
      {visible && (
        <Toast
          message="Заметка удалена"
          action="Отменить"
          onClose={close}
          onAction={() => {
            setDeleted(false);
            close();
          }}
        />
      )}
    </>
  );
}

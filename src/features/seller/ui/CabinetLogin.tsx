import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import { loadTelegram } from "../../../app/telegram/adapter";
import { telegramLaunch } from "../../../app/telegram/launch";
import { readTelegramAttempt, saveTelegramAttempt } from "../../../shared/telegram-browser-attempt";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { useEnterCabinet } from "../api";
import { finishCabinetLogin, startCabinetLogin } from "../browser-login";

type Exchange = Awaited<ReturnType<typeof startCabinetLogin>>;
const message = (error: unknown) => (error instanceof Error ? error.message : "Не удалось открыть Telegram");

export function CabinetLogin({ store, ready }: { store?: string; ready: () => void }) {
  const { mutateAsync: enter } = useEnterCabinet();
  const notify = useToast();
  const attempted = useRef(false);
  const [exchange, setExchange] = useState<Exchange | undefined>(() => readTelegramAttempt("seller"));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const startRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => startRequest.current?.abort(), []);

  useEffect(() => {
    if (!exchange) return;
    const request = new AbortController();
    const { signal } = request;
    void finishCabinetLogin(exchange, signal)
      .then(() => {
        if (signal.aborted) return;
        saveTelegramAttempt("seller");
        setExchange(undefined);
        notify("Вы вошли через Telegram");
        ready();
      })
      .catch((error: unknown) => {
        if (signal.aborted) return;
        saveTelegramAttempt("seller");
        setExchange(undefined);
        setError(message(error));
      });
    return () => request.abort();
  }, [exchange, notify, ready]);

  const start = useCallback(async () => {
    setError("");
    setStarting(true);
    const request = new AbortController();
    startRequest.current = request;
    try {
      if (telegramLaunch) {
        const telegram = await loadTelegram();
        if (!telegram?.initData) throw new Error("Откройте кабинет из Telegram");
        await enter({ initData: telegram.initData, store });
      } else {
        setExchange(await startCabinetLogin(request.signal));
      }
    } catch (error) {
      if (!request.signal.aborted) setError(message(error));
    } finally {
      if (!request.signal.aborted) setStarting(false);
    }
  }, [enter, store]);
  useEffect(() => {
    if (!telegramLaunch || attempted.current) return;
    attempted.current = true;
    void start();
  }, [start]);

  return (
    <Card size="lg" className="space-y-5">
      <img src="/brand/korzina.svg" alt="Korzina" className="mx-auto size-16" />
      {error && <p role="alert">{error}</p>}
      {exchange ? (
        <>
          <h2 className="text-title-2">Подтвердите вход в Telegram</h2>
          <div className="grid gap-2">
            <Button
              full
              size="lg"
              icon={<Send size={18} />}
              onClick={() => {
                saveTelegramAttempt("seller", exchange);
                window.location.assign(exchange.url);
              }}
            >
              Открыть Telegram
            </Button>
            <Button
              full
              variant="secondary"
              onClick={() => {
                saveTelegramAttempt("seller");
                setExchange(undefined);
              }}
            >
              Отмена
            </Button>
          </div>
        </>
      ) : (
        <Button full size="lg" icon={<Send size={18} />} loading={starting} onClick={() => void start()}>
          {error === "Ссылка для входа истекла" ? "Начать заново" : "Войти через Telegram"}
        </Button>
      )}
    </Card>
  );
}

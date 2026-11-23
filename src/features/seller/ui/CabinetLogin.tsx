import { useRouterState } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
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

export function CabinetLogin({
  store,
  ready,
  automaticLoginAttempted,
}: {
  store?: string;
  ready: () => void;
  automaticLoginAttempted: RefObject<boolean>;
}) {
  const shop = useRouterState({ select: (state) => state.location.search.shop });
  const loginStore = store ?? (typeof shop === "string" ? shop : undefined);
  const { mutateAsync: enter } = useEnterCabinet();
  const notify = useToast();
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
        await enter({ initData: telegram.initData, store: loginStore });
      } else {
        setExchange(await startCabinetLogin(request.signal, loginStore));
      }
    } catch (error) {
      if (!request.signal.aborted) setError(message(error));
    } finally {
      if (!request.signal.aborted) setStarting(false);
    }
  }, [enter, loginStore]);
  useEffect(() => {
    if (!telegramLaunch || automaticLoginAttempted.current) return;
    automaticLoginAttempted.current = true;
    void start();
  }, [automaticLoginAttempted, start]);

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

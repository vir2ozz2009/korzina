import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadTelegram } from "../../../app/telegram/adapter";
import { telegramLaunch } from "../../../app/telegram/launch";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { useEnterCabinet } from "../api";
import { finishCabinetLogin, startCabinetLogin } from "../browser-login";

type Exchange = Awaited<ReturnType<typeof startCabinetLogin>>;
const message = (error: unknown) => (error instanceof Error ? error.message : "Не удалось открыть Telegram");

export function CabinetLogin({ store, ready }: { store?: string; ready: () => void }) {
  const { mutateAsync: enter } = useEnterCabinet();
  const attempted = useRef(false);
  const [exchange, setExchange] = useState<Exchange>();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const startRequest = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => startRequest.current?.abort(), []);

  useEffect(() => {
    if (!exchange) return;
    const request = new AbortController();
    let timeout: number;
    const poll = async () => {
      if (Date.now() >= exchange.expiresAt) {
        setExchange(undefined);
        setError("Ссылка для входа истекла");
        return;
      }
      try {
        if (
          document.visibilityState === "visible" &&
          navigator.onLine &&
          (await finishCabinetLogin(exchange.exchange, request.signal))
        ) {
          setExchange(undefined);
          ready();
          return;
        }
      } catch (error) {
        if (request.signal.aborted) return;
        setExchange(undefined);
        setError(message(error));
        return;
      }
      timeout = window.setTimeout(poll, 3500);
    };
    timeout = window.setTimeout(poll, 3500);
    return () => {
      request.abort();
      window.clearTimeout(timeout);
    };
  }, [exchange, ready]);

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
              onClick={() => window.open(exchange.url, "_blank", "noopener")}
            >
              Открыть Telegram
            </Button>
            <Button full variant="secondary" onClick={() => setExchange(undefined)}>
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

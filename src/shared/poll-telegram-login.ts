import { HttpError } from "./http-error";

const active = () => document.visibilityState === "visible" && navigator.onLine;

function waitForReturn(signal: AbortSignal, milliseconds: number, wakeOnReturn: boolean) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = window.setTimeout(wake, milliseconds);
    if (wakeOnReturn) {
      document.addEventListener("visibilitychange", returned);
      window.addEventListener("focus", returned);
      window.addEventListener("pageshow", returned);
      window.addEventListener("online", returned);
    }
    signal.addEventListener("abort", abort, { once: true });

    function cleanup() {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", returned);
      window.removeEventListener("focus", returned);
      window.removeEventListener("pageshow", returned);
      window.removeEventListener("online", returned);
      signal.removeEventListener("abort", abort);
    }
    function wake() {
      cleanup();
      resolve();
    }
    function returned() {
      if (active()) wake();
    }
    function abort() {
      cleanup();
      reject(signal.reason);
    }
  });
}

export async function pollTelegramLogin<T>(
  expiresAt: number,
  signal: AbortSignal,
  finish: () => Promise<T | undefined>,
): Promise<T> {
  while (Date.now() < expiresAt) {
    signal.throwIfAborted();
    if (!active()) {
      await waitForReturn(signal, expiresAt - Date.now(), true);
      continue;
    }
    let limited = false;
    try {
      const result = await finish();
      signal.throwIfAborted();
      if (result !== undefined) return result;
    } catch (error) {
      signal.throwIfAborted();
      limited = error instanceof HttpError && error.status === 429;
      if (!limited && !(error instanceof TypeError)) throw error;
    }
    await waitForReturn(signal, Math.min(limited ? 5000 : 2200, expiresAt - Date.now()), !limited);
  }
  throw new Error("Ссылка для входа истекла");
}

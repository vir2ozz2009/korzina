export type TelegramBrowserAttempt = { exchange: string; expiresAt: number; url: string };
export type ContactLoginMode = "telegram" | "phone" | "link";

type Attempts = {
  contact: TelegramBrowserAttempt & { mode: ContactLoginMode };
  seller: TelegramBrowserAttempt;
};

export function telegramReturnPath() {
  return location.pathname + location.search;
}

function storageKey(kind: keyof Attempts) {
  return `korzina:telegram-login:${kind}:${telegramReturnPath()}`;
}

const sharedKey = (kind: keyof Attempts) => `korzina:telegram-handoff:${kind}`;
const completedKey = (kind: keyof Attempts) => `korzina:telegram-finished:${kind}`;

export function readTelegramAttempt<Kind extends keyof Attempts>(kind: Kind): Attempts[Kind] | undefined {
  try {
    const key = storageKey(kind);
    const saved = sessionStorage.getItem(key);
    const shared = location.hash === "#telegram-return" ? localStorage.getItem(sharedKey(kind)) : null;
    const handoff = shared ? (JSON.parse(shared) as { key: string; attempt: Attempts[Kind] }) : undefined;
    const attempt = saved ? (JSON.parse(saved) as Attempts[Kind]) : handoff?.key === key ? handoff.attempt : undefined;
    if (attempt && attempt.expiresAt > Date.now() && new URL(attempt.url).origin === "https://t.me") return attempt;
  } catch {
    // The browser may disallow storage.
  }
}

export function saveTelegramAttempt<Kind extends keyof Attempts>(kind: Kind, attempt?: Attempts[Kind]) {
  try {
    const key = storageKey(kind);
    if (attempt) {
      sessionStorage.setItem(key, JSON.stringify(attempt));
      localStorage.setItem(sharedKey(kind), JSON.stringify({ key, attempt }));
    } else {
      sessionStorage.removeItem(key);
      const shared = localStorage.getItem(sharedKey(kind));
      if (shared && JSON.parse(shared).key === key) localStorage.removeItem(sharedKey(kind));
    }
  } catch {
    // A native Telegram handoff can still return to the live page without storage.
  }
}

export function finishTelegramAttempt(
  kind: keyof Attempts,
  exchange: string,
  signal: AbortSignal,
  finish: () => Promise<"done" | "merge" | undefined>,
) {
  async function finishOnce() {
    try {
      if (localStorage.getItem(completedKey(kind)) === exchange) return "done" as const;
    } catch {
      // The server still protects the single-use exchange.
    }
    const result = await finish();
    if (result === "done") {
      try {
        localStorage.setItem(completedKey(kind), exchange);
      } catch {
        // The cookie is already set in this browser.
      }
    }
    return result;
  }
  // Telegram may open its return link in another tab of the same browser.
  return navigator.locks ? navigator.locks.request(exchange, { signal }, finishOnce) : finishOnce();
}

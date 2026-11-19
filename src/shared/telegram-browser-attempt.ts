export type TelegramBrowserAttempt = { exchange: string; expiresAt: number; url: string };
export type ContactLoginMode = "telegram" | "phone" | "link";

type Attempts = {
  contact: TelegramBrowserAttempt & { mode: ContactLoginMode };
  seller: TelegramBrowserAttempt;
};

function storageKey(kind: keyof Attempts) {
  return `korzina:telegram-login:${kind}:${location.pathname}${location.search}`;
}

export function readTelegramAttempt<Kind extends keyof Attempts>(kind: Kind): Attempts[Kind] | undefined {
  try {
    const saved = sessionStorage.getItem(storageKey(kind));
    if (!saved) return undefined;
    const attempt = JSON.parse(saved) as Attempts[Kind];
    if (attempt.expiresAt > Date.now() && new URL(attempt.url).origin === "https://t.me") return attempt;
  } catch {
    // The browser may disallow storage.
  }
}

export function saveTelegramAttempt<Kind extends keyof Attempts>(kind: Kind, attempt?: Attempts[Kind]) {
  try {
    if (attempt) sessionStorage.setItem(storageKey(kind), JSON.stringify(attempt));
    else sessionStorage.removeItem(storageKey(kind));
  } catch {
    // A native Telegram handoff can still return to the live page without storage.
  }
}

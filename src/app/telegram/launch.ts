const launchKey = "korzina:telegram-launch";

function isTelegramLaunch() {
  if (typeof window === "undefined") return false;
  const nativeLaunch =
    !!window.Telegram?.WebApp?.initData || /(?:^|[?#&])tgWebAppData=/.test(location.hash + location.search);
  try {
    if (nativeLaunch) sessionStorage.setItem(launchKey, "1");
    if (nativeLaunch || sessionStorage.getItem(launchKey) === "1") return true;
  } catch {
    // Storage can be unavailable; the current launch parameters still work.
    if (nativeLaunch) return true;
  }
  return new URLSearchParams(location.search).get("telegram") === "1";
}

export const telegramLaunch = isTelegramLaunch();

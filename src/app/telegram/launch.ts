export const telegramLaunch =
  typeof window !== "undefined" &&
  (!!window.Telegram?.WebApp?.initData ||
    /(?:^|[?#&])tgWebAppData=/.test(location.hash + location.search) ||
    new URLSearchParams(location.search).get("telegram") === "1");

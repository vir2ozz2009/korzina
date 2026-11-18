export const telegramLaunch =
  !!window.Telegram?.WebApp?.initData || /(?:^|[?#&])tgWebAppData=/.test(location.hash + location.search);

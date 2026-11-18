import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { shopKey } from "../../shared/shop-api";
import { authenticateTelegram } from "../../shared/shop-session";
import { useBack } from "../shell/useBack";
import { connectTelegram, loadTelegram } from "./adapter";

export function TelegramContent() {
  const root = useRouterState({
    select: (state) => !state.location.search.variants && (state.matches.at(-1)?.staticData.root ?? false),
  });
  const client = useQueryClient();
  const back = useBack();
  const [app, setApp] = useState<Awaited<ReturnType<typeof loadTelegram>>>();
  useEffect(() => {
    void loadTelegram()
      .then(setApp)
      .catch(() => {});
  }, []);
  useEffect(() => (app ? connectTelegram(app) : undefined), [app]);
  const initData = app?.initData;
  useEffect(() => {
    if (!initData) return;
    void authenticateTelegram(initData)
      .then(() => client.invalidateQueries({ queryKey: ["shop", shopKey] }))
      .catch(() => {});
  }, [client, initData]);
  useEffect(() => {
    if (!app) return;
    if (root) app.BackButton.hide();
    else app.BackButton.show();
    const handler = () => back();
    app.BackButton.onClick(handler);
    return () => app.BackButton.offClick(handler);
  }, [app, root, back]);
  return null;
}

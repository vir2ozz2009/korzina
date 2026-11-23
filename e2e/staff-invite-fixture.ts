import { sellerCookie, sessionCookie } from "../server/auth/cookies";
import { digest } from "../server/auth/tokens";
import { telegramSellerSession } from "../server/platform/auth/sessions";
import { staffBot } from "../server/platform/team/bot";
import { redeemStaffInvite } from "../server/platform/team/redeem";

export async function receiveE2eStaffInvite(request: Request, env: Env, shopId: string) {
  if (env.LOCAL_E2E !== "1") return new Response(null, { status: 404 });
  const { url, user } = await request.json<{ url?: string; user?: "owner" | "picker" }>();
  const link = URL.parse(url ?? "");
  const token = /^staff_([\w-]{43})$/.exec(link?.searchParams.get("start") ?? "")?.[1];
  if (link?.origin !== "https://t.me" || !token || (user !== "owner" && user !== "picker"))
    return new Response(null, { status: 400 });
  const digits = Number.parseInt((await digest(token)).slice(0, 7), 16)
    .toString()
    .padStart(9, "0");
  const telegram = user === "owner" ? "990000001" : `998${digits}`;
  const bot = await staffBot(env.PLATFORM, shopId);
  if (!bot || link.pathname !== `/${bot.username}`) return new Response(null, { status: 400 });
  const outcome = await redeemStaffInvite(env.PLATFORM, {
    token,
    telegram,
    name: `Учебный сборщик ${token.slice(-6)}`,
    now: Date.now(),
    channel: { shop: shopId, bot: bot.id },
  });
  if (outcome.state !== "accepted" || outcome.shop !== shopId) return Response.json(outcome, { status: 409 });
  const session = await telegramSellerSession(env.PLATFORM, telegram, shopId);
  return Response.json(outcome, {
    headers: { "Set-Cookie": sessionCookie(request, sellerCookie, session, 300) },
  });
}

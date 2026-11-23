import { sellerCookie, sessionCookie } from "../server/auth/cookies";
import { telegramSellerSession } from "../server/platform/auth/sessions";
import { redeemStaffInvite } from "../server/platform/team/redeem";

export async function receiveE2eStaffInvite(request: Request, env: Env, shopId: string) {
  if (env.LOCAL_E2E !== "1") return new Response(null, { status: 404 });
  const { url, user } = await request.json<{ url?: string; user?: "owner" | "picker" }>();
  const link = URL.parse(url ?? "");
  const token = /^staff_([\w-]{43})$/.exec(link?.searchParams.get("start") ?? "")?.[1];
  if (link?.origin !== "https://t.me" || !token || (user !== "owner" && user !== "picker"))
    return new Response(null, { status: 400 });
  const telegram = user === "owner" ? "990000001" : "990000002";
  const outcome = await redeemStaffInvite(env.PLATFORM, {
    token,
    telegram,
    name: "Учебный сборщик",
    now: Date.now(),
  });
  if (outcome.state !== "accepted" || outcome.shop !== shopId) return Response.json(outcome, { status: 409 });
  const session = await telegramSellerSession(env.PLATFORM, telegram);
  return Response.json(outcome, {
    headers: { "Set-Cookie": sessionCookie(request, sellerCookie, session, 300) },
  });
}

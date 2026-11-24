const issuer = "https://token.actions.githubusercontent.com";
const audience = "korzina-demo-regressions";
const repository = "vir2ozz2009/korzina";
const workflow = `${repository}/.github/workflows/regressions.yml`;
const bridge = `${repository}/.github/workflows/e2e.yml@refs/heads/task/QA1`;
const shop = "korzina-demo-e2e";
const owner = "korzina-demo-e2e-owner";
const encoder = new TextEncoder();

function decode(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
}

async function authorized(header) {
  if (!header || header.length > 8192) return false;
  const match = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(header);
  if (!match) return false;
  const [, encodedHeader, encodedPayload, signature] = match;
  const decoder = new TextDecoder();
  const { alg, kid } = JSON.parse(decoder.decode(decode(encodedHeader)));
  const claims = JSON.parse(decoder.decode(decode(encodedPayload)));
  const now = Date.now() / 1000;
  const direct =
    claims.workflow_ref === `${workflow}@refs/heads/main` &&
    ["schedule", "workflow_dispatch"].includes(claims.event_name);
  const beforeMerge =
    claims.workflow_ref === bridge &&
    claims.job_workflow_ref === `${workflow}@refs/heads/task/QA1` &&
    claims.event_name === "workflow_dispatch";
  if (
    alg !== "RS256" ||
    typeof kid !== "string" ||
    claims.iss !== issuer ||
    claims.aud !== audience ||
    claims.repository_id !== "1460237003" ||
    claims.repository_owner_id !== "119418392" ||
    !Number.isFinite(claims.exp) ||
    !Number.isFinite(claims.nbf) ||
    claims.exp <= now ||
    claims.nbf > now + 30 ||
    !(direct || beforeMerge)
  )
    return false;
  const keys = await fetch(`${issuer}/.well-known/jwks`, { signal: AbortSignal.timeout(5000) });
  if (!keys.ok) return false;
  const key = (await keys.json()).keys.find((candidate) => candidate.kid === kid && candidate.kty === "RSA");
  if (!key) return false;
  const imported = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    imported,
    decode(signature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
}

const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname !== "/session" || request.method !== "POST") return new Response(null, { status: 404 });
    if (!(await authorized(request.headers.get("Authorization")).catch(() => false)))
      return new Response(null, { status: 403 });
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const hash = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));
    const now = Date.now();
    const database = env.PLATFORM;
    const [, result] = await database.batch([
      database
        .prepare("DELETE FROM seller_sessions WHERE account_id=? AND shop_id=? AND expires_at<=?")
        .bind(owner, shop, now),
      database
        .prepare(
          `INSERT INTO seller_sessions(token_hash,account_id,shop_id,expires_at)
         SELECT ?,m.account_id,m.shop_id,?
         FROM memberships m JOIN shops s ON s.id=m.shop_id
         WHERE m.account_id=? AND m.shop_id=? AND s.slug='e2e' AND m.role='owner' AND m.revoked_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM memberships other WHERE other.account_id=m.account_id
             AND other.shop_id<>m.shop_id AND other.revoked_at IS NULL)`,
        )
        .bind(hash, now + 15 * 60_000, owner, shop),
    ]);
    if (result.meta.changes !== 1) return new Response(null, { status: 403 });
    return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
  },
};

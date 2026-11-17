import { isLocal } from "../../auth/cookies";
import { mediaPrefix } from "./objects";

// Local R2 has no public domain. This adapter is never available on demo/prod.
export async function localPublicMedia(request: Request, env: Env, shop: string, id: string, name: string) {
  if (!isLocal(request) || !/^(original|cutout)(-(160|400|800|1600))?\.webp$/.test(name))
    return new Response(null, { status: 404 });
  const object = await env.MEDIA_PUBLIC.get(mediaPrefix(shop, id) + name);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

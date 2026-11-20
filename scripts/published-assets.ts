export async function publishedAssetsReady(documentUrl: string, html: string) {
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js))"/gu)]
        .map((match) => match[1])
        .filter((path) => path.startsWith("/assets/")),
    ),
  ];
  if (!assets.some((path) => path.endsWith(".js"))) return false;
  const status = await Promise.all(
    assets.map(async (path) => {
      const asset = await fetch(new URL(path, documentUrl), { signal: AbortSignal.timeout(10_000) });
      const type = asset.headers.get("Content-Type") ?? "";
      await asset.body?.cancel();
      return asset.ok && (path.endsWith(".css") ? type.startsWith("text/css") : /javascript|ecmascript/iu.test(type));
    }),
  );
  return status.every(Boolean);
}

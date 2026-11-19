export function revisionResponse(request: Request, rev: number | string, read: () => unknown): Response {
  if (typeof rev === "number" ? !Number.isSafeInteger(rev) || rev < 0 : !/^[0-9]+(?:\.[0-9]+)*$/u.test(rev))
    throw new RangeError("Invalid revision");
  const etag = `"${rev}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  const matches = request.headers
    .get("If-None-Match")
    ?.split(",")
    .some((tag) => {
      const candidate = tag.trim().replace(/^W\//, "");
      return candidate === etag || candidate === "*";
    });
  if (matches) return new Response(null, { status: 304, headers });
  if (new URL(request.url).searchParams.get("rev") === String(rev)) {
    return Response.json({ unchanged: true, rev }, { headers });
  }
  return Response.json({ rev, data: read() }, { headers });
}

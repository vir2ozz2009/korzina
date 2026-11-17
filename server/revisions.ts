export function revisionResponse(request: Request, rev: number, read: () => unknown): Response {
  if (!Number.isSafeInteger(rev) || rev < 0) throw new RangeError("Invalid revision");
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

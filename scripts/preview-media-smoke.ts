import assert from "node:assert/strict";

export async function previewMediaSmoke(baseURL: string): Promise<void> {
  const origin = new URL(baseURL).origin;
  assert(new URL(origin).hostname.endsWith(".workers.dev"), "Запись smoke разрешена только в Worker Preview");
  const commandHeaders = () => ({
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  });
  const guest = await fetch(`${origin}/api/auth/guest?shop=test2`, {
    method: "POST",
    headers: commandHeaders(),
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  assert(guest.ok, `preview guest: HTTP ${guest.status}`);
  const cookie = guest.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "Preview должен создать свою гостевую сессию");
  await guest.body?.cancel();
  const fixture = "%PDF-1.7\nF10 preview smoke synthetic fixture\n";
  const upload = await fetch(`${origin}/api/media/upload?shop=test2&purpose=receipt`, {
    method: "POST",
    headers: { ...commandHeaders(), Cookie: cookie, "Content-Type": "application/pdf" },
    body: fixture,
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(upload.status, 201, `preview R2 upload: HTTP ${upload.status}`);
  const record = (await upload.json()) as { id: string; status: string; bytes: number };
  assert.equal(record.status, "temp");
  assert.equal(record.bytes, new TextEncoder().encode(fixture).byteLength);
  // The temporary fixture expires after 24 hours; the existing cleanup alarm removes it from R2.
  console.log(`Preview media smoke OK: guest 201, R2 upload 201, temp ${record.id}`);
}

import { expect, it, vi } from "vitest";
import { cleanupPreview } from "./preview-cleanup";

const repository = "owner/korzina";
const branch = "task/closed";
const id = "b".repeat(32);
const pull = {
  state: "closed",
  number: 42,
  head: { ref: branch, repo: { full_name: repository } },
  base: { ref: "main", repo: { full_name: repository } },
};
const options = { pull, repository, account: "a".repeat(32), githubToken: "test-gh", cloudflareToken: "test-cf" };

it("удаляет только превью закрытого PR по точному имени ветки", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ success: true, result: [], result_info: { total_pages: 2 } }))
    .mockResolvedValueOnce(
      Response.json({
        success: true,
        result: [
          { name: `${branch}-other`, id: "c".repeat(32) },
          { name: branch, id },
        ],
      }),
    )
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json({ success: true }));
  await expect(cleanupPreview({ ...options, request })).resolves.toBe("Превью PR #42 удалено");
  expect(request).toHaveBeenNthCalledWith(3, expect.stringContaining("head=owner%3Atask%2Fclosed"), expect.anything());
  expect(request).toHaveBeenNthCalledWith(
    4,
    expect.stringContaining(`/workers/workers/korzina-demo/previews/${id}`),
    expect.objectContaining({ method: "DELETE" }),
  );
});

it("оставляет превью, если PR открыт повторно или ветка занята другим PR", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ success: true, result: [{ name: branch, id }] }))
    .mockResolvedValueOnce(Response.json([{ number: 43 }]));
  await expect(cleanupPreview({ ...options, request })).resolves.toBe("У ветки есть открытый PR");
  expect(request).toHaveBeenCalledTimes(2);
});

it("не обращается в Cloudflare для main и закрытого PR из форка", async () => {
  const request = vi.fn<typeof fetch>();
  for (const head of [
    { ...pull.head, ref: "main" },
    { ...pull.head, repo: { full_name: "fork/korzina" } },
  ])
    await expect(cleanupPreview({ ...options, pull: { ...pull, head }, request })).resolves.toContain("Пропущено");
  expect(request).not.toHaveBeenCalled();
});

it("повторный запуск проходит, если превью уже удалено", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ success: true, result: [] }));
  await expect(cleanupPreview({ ...options, request })).resolves.toBe("Превью уже отсутствует");
  expect(request).toHaveBeenCalledTimes(1);
});

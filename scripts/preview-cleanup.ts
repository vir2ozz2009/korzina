import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

type PullRequest = {
  state: string;
  number: number;
  head: { ref: string; repo: { full_name: string } | null };
  base: { ref: string; repo: { full_name: string } };
};
type Preview = { id: string; name: string };
type CloudflareResult<T> = {
  success: boolean;
  result: T;
  result_info?: { total_pages?: number };
};

export async function cleanupPreview({
  pull,
  repository,
  account,
  githubToken,
  cloudflareToken,
  request = fetch,
}: {
  pull: PullRequest;
  repository: string;
  account: string;
  githubToken: string;
  cloudflareToken: string;
  request?: typeof fetch;
}) {
  const branch = pull.head.ref;
  if (
    pull.state !== "closed" ||
    pull.base.repo.full_name !== repository ||
    pull.base.ref !== "main" ||
    pull.head.repo?.full_name !== repository ||
    branch === "main"
  )
    return "Пропущено: PR не относится к превью этого репозитория";
  if (!githubToken || !cloudflareToken || !/^[a-f0-9]{32}$/u.test(account))
    throw new Error("Нужны токены GitHub и CLOUDFLARE_PREVIEW_CLEANUP_TOKEN и идентификатор аккаунта Cloudflare");

  const cloudflare = "https://api.cloudflare.com/client/v4/accounts";
  const previews = `${cloudflare}/${account}/workers/workers/korzina-demo/previews`;
  const cloudflareHeaders = { Authorization: `Bearer ${cloudflareToken}` };
  let preview: Preview | undefined;
  for (let page = 1; ; page++) {
    const response = await request(`${previews}?page=${page}&per_page=100`, {
      headers: cloudflareHeaders,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Cloudflare: список превью вернул HTTP ${response.status}`);
    const result = (await response.json()) as CloudflareResult<Preview[]>;
    if (!result.success) throw new Error("Cloudflare не вернул список превью");
    const matches = result.result.filter(({ name }) => name === branch);
    if (matches.length > 1) throw new Error("Найдено несколько превью с именем ветки PR");
    preview = matches[0];
    if (preview || page >= (result.result_info?.total_pages ?? 1)) break;
  }
  if (!preview) return "Превью уже отсутствует";
  if (!/^[a-f0-9]{32}$/u.test(preview.id)) throw new Error("Cloudflare вернул неверный ID превью");

  // A closed PR may have been reopened, or the branch reused for another PR.
  const head = encodeURIComponent(`${repository.split("/")[0]}:${branch}`);
  const open = await request(`https://api.github.com/repos/${repository}/pulls?state=open&head=${head}`, {
    headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!open.ok) throw new Error(`GitHub: список открытых PR вернул HTTP ${open.status}`);
  if (((await open.json()) as PullRequest[]).length) return "У ветки есть открытый PR";

  const deleted = await request(`${previews}/${preview.id}`, {
    method: "DELETE",
    headers: cloudflareHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  if (deleted.status === 404) return "Превью уже отсутствует";
  if (!deleted.ok || !((await deleted.json()) as CloudflareResult<unknown>).success)
    throw new Error(`Cloudflare: удаление превью вернуло HTTP ${deleted.status}`);
  return `Превью PR #${pull.number} удалено`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } =
    process.env;
  if (!GITHUB_EVENT_PATH || !GITHUB_REPOSITORY) throw new Error("Нужен контекст GitHub Actions");
  const { pull_request: pull } = JSON.parse(await readFile(GITHUB_EVENT_PATH, "utf8")) as { pull_request: PullRequest };
  console.log(
    await cleanupPreview({
      pull,
      repository: GITHUB_REPOSITORY,
      account: CLOUDFLARE_ACCOUNT_ID ?? "",
      githubToken: GITHUB_TOKEN ?? "",
      cloudflareToken: CLOUDFLARE_API_TOKEN ?? "",
    }),
  );
}

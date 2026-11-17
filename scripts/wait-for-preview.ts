import { appendFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, PR_HEAD_SHA, GITHUB_ENV } = process.env;
if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER || !PR_HEAD_SHA || !GITHUB_ENV)
  throw new Error("Нужен контекст PR");
for (let attempt = 0; ; attempt++) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100`,
    {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
    },
  );
  if (!response.ok) throw new Error(`GitHub comments: ${response.status}`);
  const comments = (await response.json()) as { body: string; user: { login: string } }[];
  for (const comment of comments.filter((c) => c.user.login === "cloudflare-workers-and-pages[bot]")) {
    const url = /Preview URL: (https:\/\/[a-z0-9-]+\.vir2ozz2009\.workers\.dev)/.exec(comment.body)?.[1];
    if (!url) continue;
    const page = await fetch(`${url}/?shop=test2`, { signal: AbortSignal.timeout(10_000) });
    const html = await page.text();
    const revision = /<meta[^>]*name="build-revision"[^>]*content="([a-f0-9]+)"/.exec(html)?.[1];
    console.log(`Preview revision: ${revision ?? "missing"}; expected ${PR_HEAD_SHA}`);
    if (!page.ok || revision !== PR_HEAD_SHA) continue;
    appendFileSync(GITHUB_ENV, `E2E_BASE_URL=${url}\n`);
    console.log(`Preview ready for ${PR_HEAD_SHA}: ${url}`);
    process.exit(0);
  }
  if (attempt >= 35) throw new Error(`Preview не опубликовало ${PR_HEAD_SHA} за 3 минуты`);
  await setTimeout(5000);
}

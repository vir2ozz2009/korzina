import { appendFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { publishedAssetsReady } from "./published-assets.ts";

const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, PR_HEAD_SHA, GITHUB_ENV, GITHUB_HEAD_REF } = process.env;
if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER || !PR_HEAD_SHA || !GITHUB_ENV)
  throw new Error("Нужен контекст PR");
const deadline = Date.now() + 180_000;
while (true) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100`,
    {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
    },
  );
  if (!response.ok) throw new Error(`GitHub comments: ${response.status}`);
  const comments = (await response.json()) as { body: string; user: { login: string } }[];
  const urls = comments
    .filter((c) => c.user.login === "cloudflare-workers-and-pages[bot]")
    .flatMap((comment) => {
      const url = /Preview URL: (https:\/\/[a-z0-9-]+\.vir2ozz2009\.workers\.dev)/.exec(comment.body)?.[1];
      return url ? [url] : [];
    });
  // Builds can finish before the PR opens, in which case no bot comment exists.
  // The known branch alias is accepted only after its HTML matches the full SHA.
  const slug = GITHUB_HEAD_REF?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug && slug.length <= 50) urls.push(`https://${slug}-korzina-demo.vir2ozz2009.workers.dev`);
  for (const url of new Set(urls)) {
    try {
      const documentUrl = `${url}/?shop=test2`;
      const page = await fetch(documentUrl, { signal: AbortSignal.timeout(10_000) });
      const html = await page.text();
      const revision = /<meta[^>]*name="build-revision"[^>]*content="([a-f0-9]+)"/.exec(html)?.[1];
      console.log(`Preview revision: ${revision ?? "missing"}; expected ${PR_HEAD_SHA}`);
      if (!page.ok || revision !== PR_HEAD_SHA) continue;
      if (!(await publishedAssetsReady(documentUrl, html))) {
        console.log("Preview static files are still publishing.");
        continue;
      }
      appendFileSync(GITHUB_ENV, `E2E_BASE_URL=${url}\n`);
      console.log(`Preview ready for ${PR_HEAD_SHA}: ${url}`);
      process.exit(0);
    } catch (error) {
      console.log(`Preview not ready: ${error instanceof Error ? error.message : "network error"}`);
    }
  }
  if (Date.now() >= deadline) throw new Error(`Preview не опубликовало ${PR_HEAD_SHA} за 3 минуты`);
  await setTimeout(5000);
}

import { spawn } from "node:child_process";

function run(label: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label}: ${signal ?? `exit ${code}`}`));
    });
  });
}

const npm = process.env.npm_execpath;
if (!npm) throw new Error("Запустите npm run check");

// Vitest uses its own runtime. The build writes the demo output used by smoke checks.
const results = await Promise.allSettled([
  run("Vitest", ["node_modules/vitest/vitest.mjs", "run"]),
  run("check:build", [npm, "run", "check:build"]),
]);
for (const result of results) {
  if (result.status === "fulfilled") continue;
  console.error(result.reason);
  process.exitCode = 1;
}

// Standalone, explicitly bound training worker. Never route this entrypoint through the app.
import { exports } from "cloudflare:workers";
import { RestoreShop } from "../../server/backup/RestoreShop";
import { createBackup, verifyRestore } from "../../server/backup/service";
import { Shop as BaseShop } from "../../server/shop/Shop";
import { assertTrainingIdentity } from "./identity";
import { configureTrainingShop, createTrainingOrder } from "./order";

export { RestoreShop };
export class Shop extends BaseShop {
  async configureTraining(id: string) {
    if (
      String(this.env.APP_ENV) !== "l2-drill" ||
      id !== "l2-training-a" ||
      !this.ctx.exports.Shop.idFromName(id).equals(this.ctx.id)
    )
      throw new Error("Wrong training shop");
    configureTrainingShop(this.ctx.storage);
    await this.ctx.storage.deleteAlarm();
  }
  override async alarm() {}
}

type DrillEnv = Env & {
  DRILL_TOKEN: string;
  SHOP_BINDING?: DurableObjectNamespace<Shop>;
  RESTORE_BINDING?: DurableObjectNamespace<RestoreShop>;
};
const ids = ["l2-training-a", "l2-training-b"];

const preservedEvidence = [
  { key: "l2-drill-final.json", etag: "89307e6b627ebf283898492ae8368f67" },
  { key: "korzina-prod/v1/runs/2026-11-28T10:11:03.590Z.json", etag: "db423e908be9d8ca74ab01e07a402237" },
  { key: "korzina-prod/v1/reports/2026-11-28T10:11:03.590Z.json", etag: "c7d991fde9ea6c23453a777a5c1001a4" },
  {
    key: "korzina-prod/v1/snapshots/33bd113f2d9e0434e9d33f24fb4c728e5fea947891f77e6ac13d690765a56506.json",
    etag: "0dcc5dbd7b2de9bc791e0c27f70356a7",
  },
  {
    key: "korzina-prod/v1/snapshots/e80e6c6c33e43f1d9bb70c0eb02bf259d6f60a8cb3680a3cbf38a3093fbf0aa2.json",
    etag: "809aa172dfe9492ab1f4962014077d76",
  },
  {
    key: "korzina-prod/v1/blobs/private/l2-training-a%2Freceipt/16ba23fefec09c29f7f4b7950891535a",
    etag: "16ba23fefec09c29f7f4b7950891535a",
  },
  {
    key: "korzina-prod/v1/blobs/public/l2-training-a%2Fphoto/095368112b2c78197056d94453ebd55c",
    etag: "095368112b2c78197056d94453ebd55c",
  },
];

export function createRepeatWorker(preserved: { key: string; etag: string }[]) {
  return {
    async fetch(request: Request, env: DrillEnv) {
      if (String(env.APP_ENV) !== "l2-drill" || request.method !== "POST" || !env.DRILL_TOKEN)
        return new Response(null, { status: 404 });
      const actual = new TextEncoder().encode(request.headers.get("Authorization") ?? "");
      const expected = new TextEncoder().encode(`Bearer ${env.DRILL_TOKEN}`);
      const [a, b] = await Promise.all([
        crypto.subtle.digest("SHA-256", actual),
        crypto.subtle.digest("SHA-256", expected),
      ]);
      const left = new Uint8Array(a);
      const right = new Uint8Array(b);
      let difference = 0;
      for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
      if (difference !== 0) return new Response(null, { status: 404 });
      const marker = ".l2-drill-identity";
      const buckets = [
        [env.MEDIA, "korzina-l2-drill-b-private"],
        [env.MEDIA_PUBLIC, "korzina-l2-drill-b-public"],
        [env.BACKUPS, "korzina-l2-drill-b-backups"],
        [env.RESTORE_MEDIA, "korzina-l2-drill-b-restore"],
      ] as const;
      const databases = [
        [env.PLATFORM, "8e9a1210-1d84-4861-be7d-d051c81564d6"],
        [env.RESTORE_PLATFORM, "b6801517-bffe-4d3e-b46f-bb50c39f165a"],
      ] as const;
      const databaseMarkers: string[] = [];
      for (const [db] of databases) {
        const tables = await db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'",
          )
          .all();
        if (
          JSON.stringify(tables.results.map((table) => table.name).sort()) !==
          JSON.stringify(["l2_drill_identity", "shops"])
        )
          throw new Error("Training database schema mismatch");
        const rows = await db.prepare("SELECT identity FROM l2_drill_identity").all<{ identity: string }>();
        if (rows.results.length !== 1) throw new Error("Training database identity mismatch");
        databaseMarkers.push(rows.results[0].identity);
        const schema = await db
          .prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='shops'")
          .first<{ sql: string }>();
        const shops = await db.prepare("SELECT id FROM shops ORDER BY id").all<{ id: string }>();
        if (
          schema?.sql !== "CREATE TABLE shops (id TEXT PRIMARY KEY)" ||
          JSON.stringify(shops.results.map((shop) => shop.id)) !== JSON.stringify(ids)
        )
          throw new Error("Training database contents mismatch");
      }
      const bucketMarkers: string[] = [];
      const expectedObjects: Record<string, string[]> = {
        "korzina-l2-drill-b-private": [marker, "l2-training-a/receipt"],
        "korzina-l2-drill-b-public": [marker, "l2-training-a/photo"],
        "korzina-l2-drill-b-restore": [marker, "private/l2-training-a/receipt", "public/l2-training-a/photo"],
      };
      for (const [bucket, name] of buckets) {
        const value = await bucket.get(marker);
        bucketMarkers.push(value ? await value.text() : "");
        if (name !== "korzina-l2-drill-b-backups") {
          const listed = await bucket.list({ limit: 100 });
          if (
            listed.truncated ||
            JSON.stringify(listed.objects.map((o) => o.key).sort()) !== JSON.stringify(expectedObjects[name].sort())
          )
            throw new Error("Training bucket contents mismatch");
        }
      }
      for (const [bucket, objectKey, etag] of [
        [env.MEDIA, "l2-training-a/receipt", "16ba23fefec09c29f7f4b7950891535a"],
        [env.MEDIA_PUBLIC, "l2-training-a/photo", "095368112b2c78197056d94453ebd55c"],
        [env.RESTORE_MEDIA, "private/l2-training-a/receipt", "16ba23fefec09c29f7f4b7950891535a"],
        [env.RESTORE_MEDIA, "public/l2-training-a/photo", "095368112b2c78197056d94453ebd55c"],
      ] as const) {
        if ((await bucket.head(objectKey))?.etag !== etag) throw new Error("Training media changed");
      }
      const checkPreserved = async () =>
        Promise.all(
          preserved.map(async ({ key }) => {
            const object = await env.BACKUPS.head(key);
            return { key, etag: object?.etag ?? "" };
          }),
        );
      assertTrainingIdentity({
        databaseIds: databases.map(([, identity]) => identity),
        databaseMarkers,
        bucketNames: buckets.map(([, identity]) => identity),
        bucketMarkers,
        backupBefore: preserved,
        backupNow: await checkPreserved(),
      });
      const trainingNamespace = env.SHOP_BINDING;
      if (!trainingNamespace || !env.RESTORE_BINDING) throw new Error("Training shop binding missing");
      if (
        !trainingNamespace.idFromName(ids[0]).equals(exports.Shop.idFromName(ids[0])) ||
        !env.RESTORE_BINDING.idFromName(ids[0]).equals(exports.RestoreShop.idFromName(ids[0]))
      )
        throw new Error("Training namespace mismatch");
      const runAt = new Date();
      const stamp = runAt.toISOString();
      if (
        (await env.BACKUPS.head(`korzina-prod/v1/runs/${stamp}.json`)) ||
        (await env.BACKUPS.head(`korzina-prod/v1/reports/${stamp}.json`))
      )
        throw new Error("Training run already exists");
      const trainingShop = trainingNamespace.get(trainingNamespace.idFromName(ids[0]));
      for (const [bucket] of buckets) await bucket.delete(marker);
      for (const id of ids) await exports.Shop.get(exports.Shop.idFromName(id)).seedDemoCatalog(id);
      await env.MEDIA.put("l2-training-a/receipt", "training-private");
      await env.MEDIA_PUBLIC.put("l2-training-a/photo", "training-public");
      await trainingShop.configureTraining(ids[0]);
      await createTrainingOrder(trainingShop, ids[0]);
      const before = await trainingShop.backupSnapshot();
      const sourceB = exports.Shop.get(exports.Shop.idFromName(ids[1]));
      const beforeB = await sourceB.backupSnapshot();
      const orders = before.tables.find((table) => table.name === "orders");
      const outbox = before.tables.find((table) => table.name === "order_outbox");
      if (!orders?.rows.length || !outbox?.rows.length || !orders.columns.includes("snapshot"))
        throw new Error("Training order or outbox missing");
      const money = orders.rows[orders.rows.length - 1][orders.columns.indexOf("snapshot")];
      if (typeof money !== "string") throw new Error("Training monetary snapshot missing");
      const monetarySnapshot = JSON.parse(money) as { currency?: string; totalMinor?: number };
      if (monetarySnapshot.currency !== "VND" || monetarySnapshot.totalMinor !== 45000)
        throw new Error("Training monetary snapshot mismatch");
      const key = await createBackup(env, exports, runAt);
      const report = await verifyRestore(env, exports, key);
      const after = await exports.Shop.get(exports.Shop.idFromName(ids[0])).backupSnapshot();
      const afterB = await sourceB.backupSnapshot();
      if (
        JSON.stringify(before) !== JSON.stringify(after) ||
        JSON.stringify(beforeB) !== JSON.stringify(afterB) ||
        report.shops !== 2 ||
        report.media !== 2
      )
        throw new Error("Training verification failed");
      assertTrainingIdentity({
        databaseIds: databases.map(([, identity]) => identity),
        databaseMarkers,
        bucketNames: buckets.map(([, identity]) => identity),
        bucketMarkers,
        backupBefore: preserved,
        backupNow: await checkPreserved(),
      });
      await env.BACKUPS.put(
        `l2-drill-final/${new Date().toISOString()}.json`,
        JSON.stringify({ ok: true, run: key, shops: 2, media: 2 }),
      );
      return Response.json({ ok: true, shops: report.shops, media: report.media });
    },
  };
}

export default createRepeatWorker(preservedEvidence);

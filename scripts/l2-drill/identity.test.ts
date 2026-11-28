import { describe, expect, it } from "vitest";
import { assertTrainingIdentity } from "./identity";

const valid = () => ({
  databaseIds: ["source-id", "restore-id"],
  databaseMarkers: ["source-id", "restore-id"],
  bucketNames: ["private", "public", "backup", "restore"],
  bucketMarkers: ["private", "public", "backup", "restore"],
  backupBefore: [{ key: "old-run", etag: "a" }],
  backupNow: [{ key: "old-run", etag: "a" }],
});

describe("training resources before any writes", () => {
  it("accepts distinct resources and unchanged evidence", () =>
    expect(() => assertTrainingIdentity(valid())).not.toThrow());
  it("rejects a copied source identity in the restore database", () => {
    const input = valid();
    input.databaseMarkers[1] = "source-id";
    expect(() => assertTrainingIdentity(input)).toThrow("database identity");
  });
  it("rejects aliased buckets", () => {
    const input = valid();
    input.bucketNames[3] = "backup";
    expect(() => assertTrainingIdentity(input)).toThrow("bucket identity");
  });
  it("rejects a modified or missing preserved backup", () => {
    const input = valid();
    input.backupNow[0].etag = "changed";
    expect(() => assertTrainingIdentity(input)).toThrow("backup evidence");
  });
});

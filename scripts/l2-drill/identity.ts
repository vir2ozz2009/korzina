type Evidence = { key: string; etag: string };
type TrainingIdentity = {
  databaseIds: string[];
  databaseMarkers: string[];
  bucketNames: string[];
  bucketMarkers: string[];
  backupBefore: Evidence[];
  backupNow: Evidence[];
};
export function assertTrainingIdentity(input: TrainingIdentity): void {
  const distinctAndMatching = (ids: string[], markers: string[], expected: number) =>
    ids.length === expected &&
    markers.length === expected &&
    ids.every((id, index) => id.length > 0 && id === markers[index]) &&
    new Set(ids).size === expected;
  if (!distinctAndMatching(input.databaseIds, input.databaseMarkers, 2)) throw new Error("database identity mismatch");
  if (!distinctAndMatching(input.bucketNames, input.bucketMarkers, 4)) throw new Error("bucket identity mismatch");
  const now = new Map(input.backupNow.map(({ key, etag }) => [key, etag]));
  if (!input.backupBefore.length || input.backupBefore.some(({ key, etag }) => now.get(key) !== etag))
    throw new Error("backup evidence mismatch");
}

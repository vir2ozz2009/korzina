const platformDatabase = {
  id: "82d6fc73-a04e-4014-bdb5-191b27caf6a5",
  name: "korzina-demo-platform",
};

const previewDatabase = {
  id: "f5a9d22e-3e4f-4cd2-b119-f74b8e69791f",
  name: "korzina-preview-platform",
};

export function environmentResources(preview: boolean, production = false) {
  if (preview && production) throw new Error("Preview и prod несовместимы");
  if (production)
    return {
      database: { id: "0746757c-0851-4d21-ba7f-34ae00360062", name: "korzina-prod-platform" },
      media: "korzina-prod-media",
      publicMedia: "korzina-prod-media-public",
      publicOrigin: "https://media.prod.korzina.app",
    };
  return preview
    ? {
        database: previewDatabase,
        media: "korzina-preview-media",
        publicMedia: "korzina-preview-media-public",
        publicOrigin: "https://pub-6f55bd0488f24a7982d5df51dd124113.r2.dev",
      }
    : {
        database: platformDatabase,
        media: "korzina-demo-media",
        publicMedia: "korzina-demo-media-public",
        publicOrigin: "https://media.demo.korzina.app",
      };
}

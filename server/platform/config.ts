const platformDatabase = {
  id: "82d6fc73-a04e-4014-bdb5-191b27caf6a5",
  name: "korzina-demo-platform",
};

const previewDatabase = {
  id: "f5a9d22e-3e4f-4cd2-b119-f74b8e69791f",
  name: "korzina-preview-platform",
};

export function environmentResources(preview: boolean) {
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

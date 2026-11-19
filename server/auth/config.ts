// Optional secrets are provisioned outside Git. Resource binding types come from cf workers types.
export type AuthSecrets = {
  PLATFORM_ADMIN_TELEGRAM_IDS?: string;
  PLATFORM_BOT_TOKEN?: string;
  PLATFORM_BOT_USERNAME?: string;
  PLATFORM_BOT_WEBHOOK_SECRET?: string;
  ENCRYPTION_KEY?: string;
  MEDIA_SIGNING_KEY?: string;
};

// Optional secrets are provisioned outside Git. Resource binding types come from cf workers types.
export type AuthSecrets = {
  PLATFORM_ADMIN_TELEGRAM_IDS?: string;
  ENCRYPTION_KEY?: string;
  MEDIA_SIGNING_KEY?: string;
};

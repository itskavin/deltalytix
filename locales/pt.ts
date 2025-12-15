import embed from './pt/embed'

export default {
  ...embed,
  "aiSettings.missingEncryptionKey": "Server is missing ENCRYPTION_KEY. Set it in your environment and try again.",
  "aiSettings.missingMigration": "AI settings table is missing. Apply Prisma migrations and try again.",
}

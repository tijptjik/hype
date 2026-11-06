type StorageApiCredentials = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * Reads direct R2 API credentials from the current worker environment.
 *
 * @param platform Current worker platform.
 * @returns Storage API credentials when configured, otherwise `null`.
 */
export const getStorageApiCredentials = (
  platform: App.Platform | undefined,
): StorageApiCredentials | null => {
  const accountId = platform?.env.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = platform?.env.R2_S3_ACCESS_KEY_ID
  const secretAccessKey = platform?.env.R2_S3_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null
  }

  return { accountId, accessKeyId, secretAccessKey }
}

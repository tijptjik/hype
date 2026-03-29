import { AwsClient } from 'aws4fetch'

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? ''
const accessKeyId = process.env.R2_S3_ACCESS_KEY_ID ?? ''
const secretAccessKey = process.env.R2_S3_SECRET_ACCESS_KEY ?? ''

if (!accountId || !accessKeyId || !secretAccessKey) {
  throw new Error(
    'Missing CLOUDFLARE_ACCOUNT_ID / R2_S3_ACCESS_KEY_ID / R2_S3_SECRET_ACCESS_KEY',
  )
}

const buckets = process.argv.slice(2).filter(Boolean)

if (buckets.length === 0) {
  throw new Error('Expected at least one bucket name')
}

const client = new AwsClient({
  accessKeyId,
  secretAccessKey,
  service: 's3',
  region: 'auto',
})

const listKeys = async (bucket: string): Promise<string[]> => {
  let continuationToken = ''
  const keys: string[] = []

  while (true) {
    const url = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}`)
    url.searchParams.set('list-type', '2')

    if (continuationToken) {
      url.searchParams.set('continuation-token', continuationToken)
    }

    const response = await client.fetch(url)
    const body = await response.text()

    if (!response.ok) {
      if (response.status === 404 && body.includes('<Code>NoSuchBucket</Code>')) {
        return []
      }

      throw new Error(`${bucket}: list failed ${response.status} ${body}`)
    }

    keys.push(...[...body.matchAll(/<Key>([^<]+)<\/Key>/g)].map(match => match[1] ?? ''))
    continuationToken =
      body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? ''

    if (!continuationToken) {
      return keys.filter(Boolean)
    }
  }
}

for (const bucket of buckets) {
  const initialKeys = await listKeys(bucket)
  if (initialKeys.length === 0) {
    console.log(JSON.stringify({ bucket, deleted: 0, emptied: true, missing: true }))
    continue
  }

  let deleted = 0

  while (true) {
    const keys = deleted === 0 ? initialKeys : await listKeys(bucket)

    if (keys.length === 0) {
      console.log(JSON.stringify({ bucket, deleted, emptied: true }))
      break
    }

    for (const key of keys) {
      const encodedKey = key.split('/').map(encodeURIComponent).join('/')
      const url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodedKey}`
      const response = await client.fetch(url, { method: 'DELETE' })

      if (!response.ok && response.status !== 404) {
        throw new Error(
          `${bucket}: delete failed ${key} ${response.status} ${await response.text()}`,
        )
      }

      deleted += 1

      if (deleted % 250 === 0) {
        console.log(JSON.stringify({ bucket, deleted }))
      }
    }
  }
}

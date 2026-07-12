import { S3Client } from '@aws-sdk/client-s3'
import type { S3Config, S3Credentials } from './types.js'

/**
 * Constructs an `S3Client` from a non-secret `S3Config` (region/endpoint/
 * forcePathStyle) and secret `S3Credentials` (accessKeyId/secretAccessKey/
 * sessionToken).
 *
 * Kept as the single place an `S3Client` gets constructed — `S3Storage`'s
 * constructor calls this rather than duplicating the construction call, so
 * any future change to how the client is built (e.g. additional client
 * config) only has to happen here.
 */
export function buildS3Client(config: S3Config, credentials: S3Credentials): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  })
}

import type { Readable, Writable } from 'node:stream'

// Re-exported so consumers who import from @hypersonic-js/s3 directly get the
// canonical (non-secret) config shape without also depending on
// @hypersonic-js/core's import path directly.
export type { S3Config } from '@hypersonic-js/core'

/**
 * Secret S3 credentials. Kept separate from `S3Config` (which is non-secret
 * and lives in `HypersonicConfig` via `defineConfig`) — the app is expected
 * to source these from validated environment variables (`S3_ACCESS_KEY_ID` /
 * `S3_SECRET_ACCESS_KEY` / `S3_SESSION_TOKEN`) and pass them in explicitly,
 * the same way `@hypersonic-js/limits`' `connectRedisClient` takes
 * `redisUrl` as a parameter rather than reading `process.env` itself.
 */
export interface S3Credentials {
  accessKeyId: string
  secretAccessKey: string
  /** Only needed for temporary/STS credentials. */
  sessionToken?: string
}

/** Input for `S3Storage.upload()` — a server-side, buffer-in-memory upload. */
export interface UploadFileInput {
  /** Original filename — used to derive the stored key's name and extension. */
  filename: string
  mimeType: string
  content: Buffer
}

/** Result of a successful upload — returned by every method that writes a file. */
export interface FileResult {
  /** Public URL constructed from the configured `fileUrl` and the file's key. */
  url: string
  /** The object's key within the bucket — pass this to `delete`, `getAsBuffer`, etc. */
  key: string
}

/** Input for `S3Storage.getPresignedUploadUrl()`. */
export interface PresignedUploadUrlInput {
  filename: string
  mimeType?: string
  /** Seconds until the presigned upload URL expires. Defaults to 3600 (1 hour). */
  expiresIn?: number
}

/** Input for `S3Storage.getUploadStream()`. */
export interface UploadStreamInput {
  filename: string
  mimeType: string
}

/** Result of `S3Storage.getUploadStream()`. */
export interface UploadStreamResult {
  /** Write file content into this stream; the upload completes when it ends. */
  writeStream: Writable
  /** Resolves with the final upload result once `writeStream` has ended and the upload completes. */
  promise: Promise<FileResult>
  /** Public URL the file will be available at once the upload completes. */
  url: string
  /** The object's key the file is being uploaded to. */
  fileKey: string
}

export interface IS3Storage {
  upload(file: UploadFileInput): Promise<FileResult>
  delete(fileKeys: string | string[]): Promise<void>
  getPresignedDownloadUrl(fileKey: string, expiresIn?: number): Promise<string>
  getPresignedUploadUrl(input: PresignedUploadUrlInput): Promise<FileResult>
  getUploadStream(input: UploadStreamInput): Promise<UploadStreamResult>
  getDownloadStream(fileKey: string): Promise<Readable>
  getAsBuffer(fileKey: string): Promise<Buffer>
}

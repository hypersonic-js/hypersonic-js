import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PassThrough } from 'node:stream'
import type { Readable } from 'node:stream'
import { buildS3Client } from './client.js'
import { buildFileKey, buildFileUrl } from './key.js'
import type {
  FileResult,
  IS3Storage,
  PresignedUploadUrlInput,
  S3Config,
  S3Credentials,
  UploadFileInput,
  UploadStreamInput,
  UploadStreamResult,
} from './types.js'

/** Default expiry for presigned URLs (upload and download) when not overridden per-call. */
const DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS = 60 * 60

/**
 * S3-backed implementation of `IS3Storage`. Access-key authentication only —
 * see `S3Credentials`. Does not manage object ACLs; a bucket's own ACL/policy
 * configuration (or lack thereof) is treated as the developer's
 * infrastructure concern, not something this class configures per-upload.
 */
export class S3Storage implements IS3Storage {
  private readonly client: S3Client
  private readonly config: S3Config

  /**
   * @param client Optional pre-built `S3Client` — primarily for tests to
   * inject a mocked client. When omitted, one is built from `config` and
   * `credentials` via `buildS3Client`.
   */
  constructor(config: S3Config, credentials: S3Credentials, client?: S3Client) {
    if (credentials.accessKeyId === '' || credentials.secretAccessKey === '') {
      throw new Error(
        'Hypersonic S3: accessKeyId and secretAccessKey must be non-empty strings.',
      )
    }

    this.config = config
    this.client = client ?? buildS3Client(config, credentials)
  }

  /** Builds a fresh, unique key for `filename`, namespaced under the configured prefix. */
  private keyFor(filename: string): string {
    return buildFileKey(filename, this.config.prefix ?? '')
  }

  /** Builds the public URL for a given key. */
  private urlFor(fileKey: string): string {
    return buildFileUrl(this.config.fileUrl, fileKey)
  }

  private async fetchObject(fileKey: string): Promise<GetObjectCommandOutput> {
    return this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: fileKey }),
    )
  }

  async upload(file: UploadFileInput): Promise<FileResult> {
    const fileKey = this.keyFor(file.filename)

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: fileKey,
        Body: file.content,
        ContentType: file.mimeType,
        Metadata: { 'original-filename': encodeURIComponent(file.filename) },
      }),
    )

    return { url: this.urlFor(fileKey), key: fileKey }
  }

  async delete(fileKeys: string | string[]): Promise<void> {
    if (Array.isArray(fileKeys)) {
      if (fileKeys.length === 0) return

      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: fileKeys.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      )
      return
    }

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: fileKeys }),
    )
  }

  async getPresignedDownloadUrl(
    fileKey: string,
    expiresIn: number = DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: fileKey })
    return getSignedUrl(this.client, command, { expiresIn })
  }

  async getPresignedUploadUrl(input: PresignedUploadUrlInput): Promise<FileResult> {
    const fileKey = this.keyFor(input.filename)

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: fileKey,
      ContentType: input.mimeType,
    })

    const url = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresIn ?? DEFAULT_PRESIGNED_URL_EXPIRY_SECONDS,
    })

    return { url, key: fileKey }
  }

  async getUploadStream(input: UploadStreamInput): Promise<UploadStreamResult> {
    const fileKey = this.keyFor(input.filename)
    const writeStream = new PassThrough()

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.config.bucket,
        Key: fileKey,
        Body: writeStream,
        ContentType: input.mimeType,
        Metadata: { 'original-filename': encodeURIComponent(input.filename) },
      },
    })

    const url = this.urlFor(fileKey)
    const promise = upload.done().then(() => ({ url, key: fileKey }))

    return { writeStream, promise, url, fileKey }
  }

  async getDownloadStream(fileKey: string): Promise<Readable> {
    const response = await this.fetchObject(fileKey)

    if (response.Body === undefined) {
      throw new Error(`Hypersonic S3: no body returned for key "${fileKey}".`)
    }

    return response.Body as Readable
  }

  async getAsBuffer(fileKey: string): Promise<Buffer> {
    const response = await this.fetchObject(fileKey)

    if (response.Body === undefined) {
      throw new Error(`Hypersonic S3: no body returned for key "${fileKey}".`)
    }

    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  }
}

import { describe, it, expect, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { S3Storage } from '../src/storage.js'
import type { S3Config, S3Credentials } from '../src/types.js'

const config: S3Config = {
  region: 'us-east-1',
  bucket: 'my-bucket',
  fileUrl: 'https://cdn.example.com',
}

const credentials: S3Credentials = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secretExample',
}

// ulid() produces a 26-character Crockford base32 string.
const ULID_PATTERN = '[0-9A-HJKMNP-TV-Z]{26}'

const s3Mock = mockClient(S3Client)

beforeEach(() => {
  s3Mock.reset()
})

describe('S3Storage constructor', () => {
  it('throws when accessKeyId is empty', () => {
    expect(() => new S3Storage(config, { ...credentials, accessKeyId: '' })).toThrowError(
      /accessKeyId and secretAccessKey must be non-empty/,
    )
  })

  it('throws when secretAccessKey is empty', () => {
    expect(() => new S3Storage(config, { ...credentials, secretAccessKey: '' })).toThrowError(
      /accessKeyId and secretAccessKey must be non-empty/,
    )
  })

  it('does not throw with valid credentials', () => {
    expect(() => new S3Storage(config, credentials)).not.toThrow()
  })

  it('accepts an injected client instead of building one', () => {
    const injected = new S3Client({ region: 'us-east-1' })
    const storage = new S3Storage(config, credentials, injected)
    expect(storage).toBeInstanceOf(S3Storage)
  })
})

describe('S3Storage.upload', () => {
  it('sends a PutObjectCommand with the correct Bucket, Body, and ContentType', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.upload({ filename: 'photo.jpg', mimeType: 'image/jpeg', content: Buffer.from('data') })

    const calls = s3Mock.commandCalls(PutObjectCommand)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args[0].input.Bucket).toBe('my-bucket')
    expect(calls[0]?.args[0].input.Body).toEqual(Buffer.from('data'))
    expect(calls[0]?.args[0].input.ContentType).toBe('image/jpeg')
  })

  it('generates a key with a ulid suffix, namespaced under the configured prefix', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const storage = new S3Storage(
      { ...config, prefix: 'avatars/' },
      credentials,
      new S3Client({ region: 'us-east-1' }),
    )

    const result = await storage.upload({
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      content: Buffer.from('data'),
    })

    expect(result.key).toMatch(new RegExp(`^avatars/photo-${ULID_PATTERN}\\.jpg$`))
  })

  it('returns a url built from the configured fileUrl and the generated key', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    const result = await storage.upload({
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      content: Buffer.from('data'),
    })

    expect(result.url).toBe(`https://cdn.example.com/${result.key}`)
  })

  it('sets the original-filename metadata, percent-encoded', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.upload({ filename: 'my photo.jpg', mimeType: 'image/jpeg', content: Buffer.from('d') })

    const calls = s3Mock.commandCalls(PutObjectCommand)
    expect(calls[0]?.args[0].input.Metadata).toEqual({ 'original-filename': 'my%20photo.jpg' })
  })
})

describe('S3Storage.delete', () => {
  it('sends a DeleteObjectCommand for a single key', async () => {
    s3Mock.on(DeleteObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.delete('avatars/photo.jpg')

    const calls = s3Mock.commandCalls(DeleteObjectCommand)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args[0].input).toEqual({ Bucket: 'my-bucket', Key: 'avatars/photo.jpg' })
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0)
  })

  it('sends a DeleteObjectsCommand for an array of keys, with Quiet: true', async () => {
    s3Mock.on(DeleteObjectsCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.delete(['a.jpg', 'b.jpg'])

    const calls = s3Mock.commandCalls(DeleteObjectsCommand)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args[0].input).toEqual({
      Bucket: 'my-bucket',
      Delete: { Objects: [{ Key: 'a.jpg' }, { Key: 'b.jpg' }], Quiet: true },
    })
  })

  it('sends a DeleteObjectsCommand (not DeleteObjectCommand) for a single-element array', async () => {
    s3Mock.on(DeleteObjectsCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.delete(['only.jpg'])

    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(1)
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })

  it('does not call S3 at all for an empty array', async () => {
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.delete([])

    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0)
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })
})

describe('S3Storage.getPresignedDownloadUrl', () => {
  // getSignedUrl signs locally and never calls client.send(), so these run
  // against a real (unmocked) client with fake static credentials — no
  // network I/O occurs; the assertions inspect the resulting URL's shape.
  const realClient = new S3Client({ region: 'us-east-1', credentials })

  it('returns a URL pointing at the configured bucket and key', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const url = await storage.getPresignedDownloadUrl('avatars/photo.jpg')

    expect(url).toContain('my-bucket')
    expect(url).toContain('avatars/photo.jpg')
    expect(url).toContain('X-Amz-Signature=')
  })

  it('defaults the expiry to 3600 seconds', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const url = await storage.getPresignedDownloadUrl('avatars/photo.jpg')

    expect(url).toContain('X-Amz-Expires=3600')
  })

  it('respects a custom expiry', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const url = await storage.getPresignedDownloadUrl('avatars/photo.jpg', 900)

    expect(url).toContain('X-Amz-Expires=900')
  })

  it('signs a GetObject request', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const url = await storage.getPresignedDownloadUrl('avatars/photo.jpg')

    expect(url).toContain('x-id=GetObject')
  })
})

describe('S3Storage.getPresignedUploadUrl', () => {
  const realClient = new S3Client({ region: 'us-east-1', credentials })

  it('generates a fresh key with a ulid suffix, namespaced under the configured prefix', async () => {
    const storage = new S3Storage({ ...config, prefix: 'uploads/' }, credentials, realClient)
    const result = await storage.getPresignedUploadUrl({ filename: 'doc.pdf' })

    expect(result.key).toMatch(new RegExp(`^uploads/doc-${ULID_PATTERN}\\.pdf$`))
  })

  it('returns a signed URL for the generated key', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const result = await storage.getPresignedUploadUrl({ filename: 'doc.pdf' })

    expect(result.url).toContain('my-bucket')
    expect(result.url).toContain(result.key)
    expect(result.url).toContain('x-id=PutObject')
  })

  it('defaults the expiry to 3600 seconds', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const result = await storage.getPresignedUploadUrl({ filename: 'doc.pdf' })

    expect(result.url).toContain('X-Amz-Expires=3600')
  })

  it('respects a custom expiresIn', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const result = await storage.getPresignedUploadUrl({ filename: 'doc.pdf', expiresIn: 120 })

    expect(result.url).toContain('X-Amz-Expires=120')
  })

  it('generates a different key on every call, even for the same filename', async () => {
    const storage = new S3Storage(config, credentials, realClient)
    const first = await storage.getPresignedUploadUrl({ filename: 'doc.pdf' })
    const second = await storage.getPresignedUploadUrl({ filename: 'doc.pdf' })

    expect(first.key).not.toBe(second.key)
  })
})

describe('S3Storage.getUploadStream', () => {
  it('uploads the written content via a single PutObjectCommand and resolves with { url, key }', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    const { writeStream, promise, url, fileKey } = await storage.getUploadStream({
      filename: 'video.mp4',
      mimeType: 'video/mp4',
    })

    writeStream.end('small amount of content')
    const result = await promise

    expect(result).toEqual({ url, key: fileKey })
    expect(fileKey).toMatch(new RegExp(`^video-${ULID_PATTERN}\\.mp4$`))
    expect(url).toBe(`https://cdn.example.com/${fileKey}`)

    const calls = s3Mock.commandCalls(PutObjectCommand)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args[0].input.Bucket).toBe('my-bucket')
    expect(calls[0]?.args[0].input.Key).toBe(fileKey)
    expect(calls[0]?.args[0].input.ContentType).toBe('video/mp4')
  })

  it('sets the original-filename metadata, percent-encoded', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    const { writeStream, promise } = await storage.getUploadStream({
      filename: 'my video.mp4',
      mimeType: 'video/mp4',
    })
    writeStream.end('content')
    await promise

    const calls = s3Mock.commandCalls(PutObjectCommand)
    expect(calls[0]?.args[0].input.Metadata).toEqual({ 'original-filename': 'my%20video.mp4' })
  })

  it('namespaces the generated key under the configured prefix', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const storage = new S3Storage(
      { ...config, prefix: 'videos/' },
      credentials,
      new S3Client({ region: 'us-east-1' }),
    )

    const { fileKey } = await storage.getUploadStream({ filename: 'clip.mp4', mimeType: 'video/mp4' })

    expect(fileKey).toMatch(new RegExp(`^videos/clip-${ULID_PATTERN}\\.mp4$`))
  })
})

describe('S3Storage.getDownloadStream', () => {
  it('returns the response Body as a Readable', async () => {
    const body = Readable.from(['chunk'])
    s3Mock.on(GetObjectCommand).resolves({ Body: body as never })
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    const stream = await storage.getDownloadStream('avatars/photo.jpg')

    expect(stream).toBe(body)
  })

  it('requests the correct Bucket and Key', async () => {
    const body = Readable.from(['chunk'])
    s3Mock.on(GetObjectCommand).resolves({ Body: body as never })
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.getDownloadStream('avatars/photo.jpg')

    const calls = s3Mock.commandCalls(GetObjectCommand)
    expect(calls[0]?.args[0].input).toEqual({ Bucket: 'my-bucket', Key: 'avatars/photo.jpg' })
  })

  it('throws a clear error when no Body is returned', async () => {
    s3Mock.on(GetObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await expect(storage.getDownloadStream('missing.jpg')).rejects.toThrowError(
      /no body returned for key "missing\.jpg"/,
    )
  })
})

describe('S3Storage.getAsBuffer', () => {
  it('returns the response Body as a Buffer', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToByteArray: async () => bytes } as never,
    })
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    const buffer = await storage.getAsBuffer('avatars/photo.jpg')

    expect(buffer).toBeInstanceOf(Buffer)
    expect(Array.from(buffer)).toEqual([1, 2, 3])
  })

  it('requests the correct Bucket and Key', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToByteArray: async () => new Uint8Array() } as never,
    })
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await storage.getAsBuffer('avatars/photo.jpg')

    const calls = s3Mock.commandCalls(GetObjectCommand)
    expect(calls[0]?.args[0].input).toEqual({ Bucket: 'my-bucket', Key: 'avatars/photo.jpg' })
  })

  it('throws a clear error when no Body is returned', async () => {
    s3Mock.on(GetObjectCommand).resolves({})
    const storage = new S3Storage(config, credentials, new S3Client({ region: 'us-east-1' }))

    await expect(storage.getAsBuffer('missing.jpg')).rejects.toThrowError(
      /no body returned for key "missing\.jpg"/,
    )
  })
})
